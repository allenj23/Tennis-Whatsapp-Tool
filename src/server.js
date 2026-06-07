const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const multer  = require('multer');

const { PORT } = require('./config');
const whatsapp = require('./whatsapp');
const excel    = require('./excel');
const sheets   = require('./sheets');
const sources  = require('./sources');
const sync     = require('./sync');
const { sendCampaign } = require('./sender');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

let isSending = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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

/** List all saved sources + active index */
app.get('/api/sources', (req, res) => {
  res.json({ sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
});

/** Add a new source.  Body: { url|id, name, tabName? } */
app.post('/api/sources', (req, res) => {
  try {
    const { url, id: rawId, name, tabName = '' } = req.body || {};

    // Accept either a full Sheet URL or a bare spreadsheet ID
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

/** Remove a source by index */
app.delete('/api/sources/:index', (req, res) => {
  try {
    sources.remove(Number(req.params.index));
    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Activate a source — switches polling target and triggers an immediate sync */
app.post('/api/sources/:index/activate', (req, res) => {
  try {
    sync.switchSource(Number(req.params.index));
    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Update the tab for a source.  Body: { tabName } */
app.patch('/api/sources/:index', (req, res) => {
  try {
    const index   = Number(req.params.index);
    const tabName = req.body.tabName ?? '';
    sources.updateTab(index, tabName);

    // If this is the active source, trigger an immediate resync
    if (index === sources.getActiveIndex()) {
      sync.triggerNow();
    }

    res.json({ ok: true, sources: sources.getAll(), activeIndex: sources.getActiveIndex() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** List all worksheet tabs for a source */
app.get('/api/sources/:index/tabs', async (req, res) => {
  try {
    const index  = Number(req.params.index);
    const source = sources.getAll()[index];
    if (!source) return res.status(404).json({ error: 'Source not found.' });

    const tabs = await sheets.fetchSheetTabs(source.id);
    res.json({ tabs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Manual Google Sheets sync ──────────────────────────────────────────────────
app.post('/api/sync', (req, res) => {
  if (!sources.isConfigured()) {
    return res.status(400).json({ error: 'Google Sheets is not configured.' });
  }
  sync.triggerNow();
  res.json({ ok: true });
});

// ── Send campaign ──────────────────────────────────────────────────────────────
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
io.on('connection', (socket) => {
  console.log('Browser connected:', socket.id);

  socket.emit('server:ready', { sheetsConfigured: sources.isConfigured() });

  // Sync WhatsApp state
  const { state, info } = whatsapp.getStatus();
  if (state === 'ready')            socket.emit('wa:ready', info);
  else if (state === 'authenticating') socket.emit('wa:authenticated');

  // Sync contacts if already loaded
  const contacts = excel.getContacts();
  if (contacts.length > 0) {
    socket.emit('contacts:loaded', { contacts, groups: excel.getGroups() });
  }

  // Send current sync status and sources list
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

server.listen(PORT, () => {
  console.log(`WhatsApp Campaign Tool running at http://localhost:${PORT}`);
  sync.start(io);
});
