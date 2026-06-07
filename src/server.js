const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');

const { PORT } = require('./config');
const whatsapp = require('./whatsapp');
const excel = require('./excel');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Upload endpoint ────────────────────────────────────────────────────────────
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

// ── Socket connection ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Browser connected:', socket.id);

  socket.emit('server:ready');

  // Sync WhatsApp state for late-connecting browsers
  const { state, info } = whatsapp.getStatus();
  if (state === 'ready') {
    socket.emit('wa:ready', info);
  } else if (state === 'authenticating') {
    socket.emit('wa:authenticated');
  }

  // Sync contact list if already uploaded
  const contacts = excel.getContacts();
  if (contacts.length > 0) {
    socket.emit('contacts:loaded', { contacts, groups: excel.getGroups() });
  }

  socket.on('disconnect', () => {
    console.log('Browser disconnected:', socket.id);
  });
});

whatsapp.init(io);

server.listen(PORT, () => {
  console.log(`WhatsApp Campaign Tool running at http://localhost:${PORT}`);
});
