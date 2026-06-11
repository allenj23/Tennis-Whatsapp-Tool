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

/** Preserve first-seen order; drop duplicate chatIds (shared phones across enrollments). */
function dedupeChatIds(chatIds) {
  const seen = new Set();
  const out  = [];
  for (const id of chatIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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
function _emit(io, event, data) {
  const { broadcastTarget } = require('./google-auth/socketAuth');
  broadcastTarget(io).emit(event, data);
}

async function sendCampaign({ chatIds, message, media, io, contacts }) {
  const client = getClient();
  const uniqueChatIds = dedupeChatIds(chatIds);
  const nameMap = {};
  for (const c of contacts) {
    if (!nameMap[c.chatId]) nameMap[c.chatId] = c.name;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < uniqueChatIds.length; i++) {
    const chatId = uniqueChatIds[i];
    const name = nameMap[chatId] || chatId;

    // Emit "sending" state before attempt
    _emit(io, 'send:progress', { chatId, name, status: 'sending', index: i, total: uniqueChatIds.length });

    try {
      if (media) {
        const mediaObj = new MessageMedia(media.mimetype, media.buffer.toString('base64'), media.filename);
        await client.sendMessage(chatId, mediaObj, { caption: message });
      } else {
        await client.sendMessage(chatId, message);
      }

      sentCount++;
      _emit(io, 'send:progress', { chatId, name, status: 'sent', index: i, total: uniqueChatIds.length });
      console.log(`Sent [${i + 1}/${uniqueChatIds.length}] ${name}`);
    } catch (err) {
      failedCount++;
      const error = err.message || 'Unknown error';
      _emit(io, 'send:progress', { chatId, name, status: 'failed', error, index: i, total: uniqueChatIds.length });
      console.error(`Failed [${i + 1}/${uniqueChatIds.length}] ${name}:`, error);
    }

    // Throttle delay between sends (skip after last recipient)
    if (i < uniqueChatIds.length - 1) {
      await randomDelay();
    }
  }

  _emit(io, 'send:done', { total: uniqueChatIds.length, sent: sentCount, failed: failedCount });
  console.log(`Campaign done — ${sentCount} sent, ${failedCount} failed`);
}

module.exports = { sendCampaign, dedupeChatIds };
