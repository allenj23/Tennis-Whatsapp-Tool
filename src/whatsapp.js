const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let currentState = 'disconnected'; // disconnected | authenticating | ready
let currentInfo = null;            // { name, phone } when ready
let _io = null;

function getStatus() {
  return { state: currentState, info: currentInfo };
}

function _attachHandlers(c, io) {
  c.on('qr', async (qr) => {
    currentState = 'authenticating';
    currentInfo = null;
    console.log('WhatsApp QR received');
    try {
      const dataUrl = await qrcode.toDataURL(qr);
      io.emit('wa:qr', dataUrl);
    } catch (err) {
      console.error('Failed to generate QR data URL:', err);
    }
  });

  c.on('authenticated', () => {
    currentState = 'authenticating';
    io.emit('wa:authenticated');
    console.log('WhatsApp authenticated, loading session...');
  });

  c.on('ready', () => {
    currentState = 'ready';
    currentInfo = {
      name: c.info.pushname,
      phone: c.info.wid.user,
    };
    io.emit('wa:ready', currentInfo);
    console.log(`WhatsApp ready — ${currentInfo.name} (${currentInfo.phone})`);
  });

  c.on('auth_failure', (msg) => {
    currentState = 'disconnected';
    currentInfo = null;
    io.emit('wa:auth_failure', msg);
    console.error('WhatsApp auth failure:', msg);
  });

  c.on('disconnected', (reason) => {
    currentState = 'disconnected';
    currentInfo = null;
    io.emit('wa:disconnected', reason);
    console.log('WhatsApp disconnected:', reason);
  });
}

function _startClient(io) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  _attachHandlers(client, io);
  client.initialize();
  console.log('WhatsApp client initializing...');
}

function init(io) {
  _io = io;
  _startClient(io);
}

async function disconnect(io) {
  const active = client;
  client = null;
  currentState = 'disconnected';
  currentInfo = null;
  const socketIo = io || _io;

  if (active) {
    try {
      await active.logout();
    } catch (err) {
      console.warn('WhatsApp logout:', err.message);
      try { await active.destroy(); } catch {}
    }
  }

  if (socketIo) _startClient(socketIo);
}

function getClient() {
  return client;
}

module.exports = { init, disconnect, getClient, getStatus };
