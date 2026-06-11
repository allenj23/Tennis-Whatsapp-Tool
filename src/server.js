const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const multer  = require('multer');

const { PORT } = require('./config');
const whatsapp = require('./whatsapp');
const excel    = require('./excel');
const sheets   = require('./sheets');
const sources    = require('./sources');
const sync       = require('./sync');
const templates  = require('./templates');
const { sendCampaign, dedupeChatIds } = require('./sender');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: ['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT], credentials: true },
});

const upload = multer({ storage: multer.memoryStorage() });

let isSending = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const googleAuthRoutes = require('./google-auth/routes');
googleAuthRoutes.mount(app);

const googleAuthConfig = require('./google-auth/config');
const spreadsheetAccess = require('./google-auth/spreadsheetAccess');

if (googleAuthConfig.isSsoMode() && googleAuthConfig.isVendorConfigured()) {
  app.use('/api', async (req, res, next) => {
    if (googleAuthRoutes.isPublicGooglePath(req.path)) return next();
    try {
      await googleAuthRoutes.requireAppAuth(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}

// ── Upload contact list (Excel) ────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }
  try {
    const result = excel.parseBuffer(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('Excel parse error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to parse the Excel file.' });
  }
});

// ── Contacts state (for page reloads) ─────────────────────────────────────────
app.get('/api/contacts', (req, res) => {
  res.json({ contacts: excel.getContacts(), groups: excel.getGroups() });
});

// ── Sources — CRUD ─────────────────────────────────────────────────────────────

app.get('/api/sources', (req, res) => {
  res.json({ sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
});

app.post('/api/sources', async (req, res) => {
  if (googleAuthConfig.isSsoMode()) {
    return res.status(403).json({
      error: 'Use the Google sheet picker to connect a spreadsheet in SSO mode.',
    });
  }

  try {
    const { url, id: rawId, name, tabName = '' } = req.body || {};

    let spreadsheetId = rawId || '';
    if (!spreadsheetId && url) {
      const match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) {
        return res.status(400).json({ error: 'Could not extract a spreadsheet ID from the URL.' });
      }
      spreadsheetId = match[1];
    }

    const index = sources.add({ id: spreadsheetId, name, tabName });
    res.json({ ok: true, index, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/sources/:index', (req, res) => {
  try {
    sources.remove(Number(req.params.index));
    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sources/:index/activate', (req, res) => {
  try {
    sync.switchSource(Number(req.params.index));
    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/sources/:index', (req, res) => {
  try {
    const index   = Number(req.params.index);
    const tabName = req.body.tabName ?? '';
    sources.updateTab(index, tabName);

    if (index === sources.getActiveIndex()) {
      sync.triggerNow();
    }

    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/sources/:index/tabs', async (req, res) => {
  try {
    const index  = Number(req.params.index);
    const source = sources.getAll()[index];
    if (!source) return res.status(404).json({ error: 'Source not found.' });

    if (googleAuthConfig.isSsoMode()) {
      await spreadsheetAccess.assertAccessible(source.id);
    }

    const googleOAuth = require('./google-auth/oauth');
    const googleSheets = require('./google-auth/sheets');
    let tabs;
    if (googleOAuth.isConnected() && !googleAuthConfig.isSsoMode()) {
      const meta = await googleSheets.fetchSheetTabs(source.id);
      tabs = meta.tabs;
    } else {
      tabs = await sheets.fetchSheetTabs(source.id);
    }
    res.json({ tabs });
  } catch (err) {
    const status = /not available/i.test(err.message) ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/whatsapp/disconnect', async (_req, res) => {
  try {
    await whatsapp.disconnect(io);
    res.json({ ok: true });
  } catch (err) {
    console.error('WhatsApp disconnect error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to disconnect WhatsApp.' });
  }
});

app.get('/api/templates', (_req, res) => {
  res.json({ templates: templates.getAll() });
});

app.post('/api/templates', (req, res) => {
  try {
    const entry = templates.add(req.body || {});
    res.json({ ok: true, template: entry, templates: templates.getAll() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const list = templates.remove(req.params.id);
    res.json({ ok: true, templates: list });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sync', (req, res) => {
  if (!sources.isConfigured()) {
    return res.status(400).json({ error: 'Google Sheets is not configured.' });
  }
  sync.triggerNow();
  res.json({ ok: true });
});

app.post('/api/send', upload.single('media'), async (req, res) => {
  if (isSending) {
    return res.status(409).json({ error: 'A send is already in progress.' });
  }

  const { state } = whatsapp.getStatus();
  if (state !== 'ready') {
    return res.status(400).json({ error: 'WhatsApp is not connected.' });
  }

  let chatIds;
  try {
    chatIds = JSON.parse(req.body.chatIds || '[]');
  } catch {
    return res.status(400).json({ error: 'Invalid recipient list.' });
  }

  const message = (req.body.message || '').trim();
  if (!message && !req.file) {
    return res.status(400).json({ error: 'Message or media is required.' });
  }
  chatIds = dedupeChatIds(chatIds);
  if (chatIds.length === 0) {
    return res.status(400).json({ error: 'No recipients selected.' });
  }

  const media = req.file
    ? { buffer: req.file.buffer, mimetype: req.file.mimetype, filename: req.file.originalname }
    : null;

  isSending = true;
  res.json({ ok: true, total: chatIds.length });

  try {
    await sendCampaign({ chatIds, message, media, io, contacts: excel.getContacts() });
  } finally {
    isSending = false;
  }
});

// ── Socket connection ──────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log('Browser connected:', socket.id);

  const googleAuth   = require('./google-auth/oauth');
  const googleCfg    = require('./google-auth/config');
  const { authorizeSocket } = require('./google-auth/socketAuth');

  const auth = await authorizeSocket(socket);

  socket.emit('server:ready', {
    sheetsConfigured: sources.isConfigured(),
    googleOAuthMode:  googleCfg.isVendorConfigured(),
    googleSsoMode:    googleCfg.isSsoMode(),
    googleConnected:  auth.authorized,
  });

  if (auth.revoked) {
    socket.emit('auth:revoked', { message: 'Your access was revoked. Sign in again.' });
  } else if (auth.needsSignIn && googleCfg.isSsoMode() && googleCfg.isVendorConfigured()) {
    socket.emit('auth:required');
  }

  const { state, info } = whatsapp.getStatus();
  if (state === 'ready')            socket.emit('wa:ready', info);
  else if (state === 'authenticating') socket.emit('wa:authenticated');

  if (!auth.authorized) {
    socket.on('disconnect', () => console.log('Browser disconnected:', socket.id));
    return;
  }

  const contacts = excel.getContacts();
  if (contacts.length > 0) {
    socket.emit('contacts:loaded', { contacts, groups: excel.getGroups() });
  }

  if (sources.isConfigured()) {
    const syncStatus = sync.getStatus();
    if (syncStatus.status !== 'idle') socket.emit('sync:status', syncStatus);
    socket.emit('sources:updated', {
      sources:     sources.getAll(),
      activeIndex: sources.getActiveIndex(),
    });
  }

  socket.on('disconnect', () => console.log('Browser disconnected:', socket.id));
});

whatsapp.init(io);

const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`WhatsApp Campaign Tool running at ${url}`);
  if (require('./google-auth/config').isVendorConfigured()) {
    console.log(`[google-auth] OAuth redirect: ${require('./google-auth/config').redirectUri}`);
  }
  sync.start(io);
});
