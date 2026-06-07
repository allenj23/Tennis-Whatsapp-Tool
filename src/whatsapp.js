const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let currentState = 'disconnected'; // disconnected | authenticating | ready
let currentInfo = null;            // { name, phone } when ready

function getStatus() {
  return { state: currentState, info: currentInfo };
}

function init(io) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', async (qr) => {
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

  client.on('authenticated', () => {
    currentState = 'authenticating';
    io.emit('wa:authenticated');
    console.log('WhatsApp authenticated, loading session...');
  });

  client.on('ready', () => {
    currentState = 'ready';
    currentInfo = {
      name: client.info.pushname,
      phone: client.info.wid.user,
    };
    io.emit('wa:ready', currentInfo);
    console.log(`WhatsApp ready — ${currentInfo.name} (${currentInfo.phone})`);
  });

  client.on('auth_failure', (msg) => {
    currentState = 'disconnected';
    currentInfo = null;
    io.emit('wa:auth_failure', msg);
    console.error('WhatsApp auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    currentState = 'disconnected';
    currentInfo = null;
    io.emit('wa:disconnected', reason);
    console.log('WhatsApp disconnected:', reason);
  });

  client.initialize();
  console.log('WhatsApp client initializing...');
}

function getClient() {
  return client;
}

module.exports = { init, getClient, getStatus };
