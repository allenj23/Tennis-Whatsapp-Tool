const { MessageMedia } = require('whatsapp-web.js');
const { getClient } = require('./whatsapp');

/** Random delay in ms between MIN and MAX to reduce spam detection risk. */
const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 5000;

function randomDelay() {
  return new Promise((resolve) =>
    setTimeout(resolve, DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS))
  );
}

/**
 * Send a message to a list of recipients one by one.
 * Emits 'send:progress' on the socket after each attempt.
 *
 * @param {object} opts
 * @param {string[]}      opts.chatIds   - WhatsApp chat IDs (e.g. "972501234567@c.us")
 * @param {string}        opts.message   - Text body
 * @param {object|null}   opts.media     - { buffer, mimetype, filename } or null
 * @param {object}        opts.io        - socket.io server instance
 * @param {object[]}      opts.contacts  - Full contact list for name lookup
 */
async function sendCampaign({ chatIds, message, media, io, contacts }) {
  const client = getClient();
  const nameMap = Object.fromEntries(contacts.map((c) => [c.chatId, c.name]));

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < chatIds.length; i++) {
    const chatId = chatIds[i];
    const name = nameMap[chatId] || chatId;

    // Emit "sending" state before attempt
    io.emit('send:progress', { chatId, name, status: 'sending', index: i, total: chatIds.length });

    try {
      if (media) {
        const mediaObj = new MessageMedia(media.mimetype, media.buffer.toString('base64'), media.filename);
        await client.sendMessage(chatId, mediaObj, { caption: message });
      } else {
        await client.sendMessage(chatId, message);
      }

      sentCount++;
      io.emit('send:progress', { chatId, name, status: 'sent', index: i, total: chatIds.length });
      console.log(`Sent [${i + 1}/${chatIds.length}] ${name}`);
    } catch (err) {
      failedCount++;
      const error = err.message || 'Unknown error';
      io.emit('send:progress', { chatId, name, status: 'failed', error, index: i, total: chatIds.length });
      console.error(`Failed [${i + 1}/${chatIds.length}] ${name}:`, error);
    }

    // Throttle delay between sends (skip after last recipient)
    if (i < chatIds.length - 1) {
      await randomDelay();
    }
  }

  io.emit('send:done', { total: chatIds.length, sent: sentCount, failed: failedCount });
  console.log(`Campaign done — ${sentCount} sent, ${failedCount} failed`);
}

module.exports = { sendCampaign };
