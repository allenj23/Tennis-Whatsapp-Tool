const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');

const { PORT } = require('./config');
const whatsapp = require('./whatsapp');
const excel    = require('./excel');
const sheets   = require('./sheets');
const sync     = require('./sync');
const { sendCampaign } = require('./sender');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

let isSending = false; // prevent overlapping campaigns

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Upload contact list ────────────────────────────────────────────────────────
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

// ── Manual Google Sheets sync ──────────────────────────────────────────────────
// Delegates to the polling service (force=true bypasses the modifiedTime check).
// The actual result arrives via sync:status / contacts:loaded socket events.
app.post('/api/sync', (req, res) => {
  if (!sheets.isConfigured()) {
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

  // Acknowledge immediately; progress comes over socket
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

  socket.emit('server:ready', { sheetsConfigured: sheets.isConfigured() });

  // Sync WhatsApp state for late-connecting browsers
  const { state, info } = whatsapp.getStatus();
  if (state === 'ready') {
    socket.emit('wa:ready', info);
  } else if (state === 'authenticating') {
    socket.emit('wa:authenticated');
  }

  // Sync contact list if already loaded (upload or sheets sync)
  const contacts = excel.getContacts();
  if (contacts.length > 0) {
    socket.emit('contacts:loaded', { contacts, groups: excel.getGroups() });
  }

  // Send the current sheets sync status so the browser shows the right badge
  if (sheets.isConfigured()) {
    const syncStatus = sync.getStatus();
    if (syncStatus.status !== 'idle') {
      socket.emit('sync:status', syncStatus);
    }
  }

  socket.on('disconnect', () => {
    console.log('Browser disconnected:', socket.id);
  });
});

whatsapp.init(io);

server.listen(PORT, () => {
  console.log(`WhatsApp Campaign Tool running at http://localhost:${PORT}`);
  sync.start(io); // begin polling Google Sheets (no-op if not configured)
});
