const path = require('path');

/**
 * Loads src/sender.js with its two external dependencies replaced by fakes,
 * by pre-seeding the CommonJS require cache. This lets us exercise the real
 * send loop logic without launching Puppeteer or hitting WhatsApp.
 *
 * Returns { sendCampaign, getFakeClient, setFakeClient, MessageMediaCalls }.
 */
function loadSenderWithMocks() {
  const srcDir = path.join(__dirname, '..', '..', 'src');
  const waWebPath = require.resolve('whatsapp-web.js', { paths: [srcDir] });
  const waPath = require.resolve(path.join(srcDir, 'whatsapp.js'));
  const senderPath = require.resolve(path.join(srcDir, 'sender.js'));

  const MessageMediaCalls = [];
  class FakeMessageMedia {
    constructor(mimetype, data, filename) {
      this.mimetype = mimetype;
      this.data = data;
      this.filename = filename;
      MessageMediaCalls.push({ mimetype, data, filename });
    }
  }

  let fakeClient = null;
  const setFakeClient = (c) => { fakeClient = c; };
  const getFakeClient = () => fakeClient;

  // Seed the cache so sender.js picks up the fakes on require.
  require.cache[waWebPath] = {
    id: waWebPath, filename: waWebPath, loaded: true,
    exports: { MessageMedia: FakeMessageMedia },
  };
  require.cache[waPath] = {
    id: waPath, filename: waPath, loaded: true,
    exports: { getClient: () => fakeClient, init: () => {}, getStatus: () => ({ state: 'ready', info: null }) },
  };

  delete require.cache[senderPath];
  const { sendCampaign } = require(senderPath);

  return { sendCampaign, setFakeClient, getFakeClient, MessageMediaCalls };
}

/** A fake WhatsApp client that records sends and can be told which chatIds fail. */
function makeFakeClient({ failChatIds = [] } = {}) {
  const failSet = new Set(failChatIds);
  const sent = [];
  return {
    sent,
    async sendMessage(chatId, content, options) {
      sent.push({ chatId, content, options });
      if (failSet.has(chatId)) {
        throw new Error(`send failed for ${chatId}`);
      }
      return { id: { _serialized: `${chatId}_msg` } };
    },
  };
}

/** Collects socket.io emit() calls for assertions. */
function makeFakeIo() {
  const events = [];
  return {
    events,
    emit(event, payload) { events.push({ event, payload }); },
    byType(type) { return events.filter((e) => e.event === type); },
    progressFor(chatId) {
      return events.filter((e) => e.event === 'send:progress' && e.payload.chatId === chatId);
    },
  };
}

/**
 * Replace global setTimeout with an immediate (microtask) version so the
 * sender's throttle delay does not slow the suite. Returns a restore fn.
 */
function patchInstantTimers() {
  const original = global.setTimeout;
  global.setTimeout = (fn) => { Promise.resolve().then(fn); return 0; };
  return () => { global.setTimeout = original; };
}

module.exports = { loadSenderWithMocks, makeFakeClient, makeFakeIo, patchInstantTimers };
