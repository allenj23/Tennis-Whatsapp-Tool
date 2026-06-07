const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadSenderWithMocks,
  makeFakeClient,
  makeFakeIo,
  patchInstantTimers,
} = require('./helpers/wa-mock');

// Load sender.js once with whatsapp + whatsapp-web.js replaced by fakes.
const { sendCampaign, setFakeClient, MessageMediaCalls } = loadSenderWithMocks();

let restoreTimers;
beforeEach(() => { restoreTimers = patchInstantTimers(); MessageMediaCalls.length = 0; });
afterEach(() => { restoreTimers(); });

const contacts = [
  { name: 'Alice', phone: '972501111111', chatId: '972501111111@c.us', group: 'A' },
  { name: 'Bob', phone: '972502222222', chatId: '972502222222@c.us', group: 'A' },
  { name: 'Carol', phone: '972503333333', chatId: '972503333333@c.us', group: 'B' },
];
const ids = contacts.map((c) => c.chatId);

describe('sender.sendCampaign — text messages (expected PASS)', () => {
  test('sends a plain text message to each recipient, in order', async () => {
    const client = makeFakeClient();
    setFakeClient(client);
    const io = makeFakeIo();

    await sendCampaign({ chatIds: ids, message: 'Hello', media: null, io, contacts });

    assert.equal(client.sent.length, 3);
    assert.deepEqual(client.sent.map((s) => s.chatId), ids); // sequential, ordered
    assert.equal(client.sent[0].content, 'Hello');           // text, not MessageMedia
    assert.equal(MessageMediaCalls.length, 0);
  });

  test('emits sending then sent for each recipient, and a final done summary', async () => {
    setFakeClient(makeFakeClient());
    const io = makeFakeIo();

    await sendCampaign({ chatIds: ids, message: 'Hi', media: null, io, contacts });

    // Each recipient: one 'sending' + one 'sent'
    for (const id of ids) {
      const p = io.progressFor(id);
      assert.deepEqual(p.map((e) => e.payload.status), ['sending', 'sent']);
    }
    const done = io.byType('send:done');
    assert.equal(done.length, 1);
    assert.deepEqual(done[0].payload, { total: 3, sent: 3, failed: 0 });
  });

  test('resolves contact name from contacts list', async () => {
    setFakeClient(makeFakeClient());
    const io = makeFakeIo();
    await sendCampaign({ chatIds: [ids[0]], message: 'Hi', media: null, io, contacts });
    assert.equal(io.progressFor(ids[0])[0].payload.name, 'Alice');
  });

  test('unknown chatId falls back to the id as the display name', async () => {
    setFakeClient(makeFakeClient());
    const io = makeFakeIo();
    const stranger = '972500000000@c.us';
    await sendCampaign({ chatIds: [stranger], message: 'Hi', media: null, io, contacts });
    assert.equal(io.progressFor(stranger)[0].payload.name, stranger);
  });
});

describe('sender.sendCampaign — media messages (expected PASS)', () => {
  test('builds a MessageMedia with base64 data and sends with caption', async () => {
    const client = makeFakeClient();
    setFakeClient(client);
    const io = makeFakeIo();
    const media = { buffer: Buffer.from('PDFDATA'), mimetype: 'application/pdf', filename: 'flyer.pdf' };

    await sendCampaign({ chatIds: [ids[0]], message: 'See flyer', media, io, contacts });

    assert.equal(MessageMediaCalls.length, 1);
    assert.equal(MessageMediaCalls[0].mimetype, 'application/pdf');
    assert.equal(MessageMediaCalls[0].filename, 'flyer.pdf');
    assert.equal(MessageMediaCalls[0].data, Buffer.from('PDFDATA').toString('base64'));
    // caption carries the message text
    assert.equal(client.sent[0].options.caption, 'See flyer');
  });
});

describe('sender.sendCampaign — failure handling (expected PASS)', () => {
  test('a failing recipient is reported failed but does not stop the run', async () => {
    setFakeClient(makeFakeClient({ failChatIds: [ids[1]] }));
    const io = makeFakeIo();

    await sendCampaign({ chatIds: ids, message: 'Hi', media: null, io, contacts });

    assert.deepEqual(io.progressFor(ids[0]).map((e) => e.payload.status), ['sending', 'sent']);
    assert.deepEqual(io.progressFor(ids[1]).map((e) => e.payload.status), ['sending', 'failed']);
    assert.deepEqual(io.progressFor(ids[2]).map((e) => e.payload.status), ['sending', 'sent']);

    const failEvent = io.progressFor(ids[1]).find((e) => e.payload.status === 'failed');
    assert.match(failEvent.payload.error, /send failed/);

    assert.deepEqual(io.byType('send:done')[0].payload, { total: 3, sent: 2, failed: 1 });
  });

  test('all recipients failing still completes with a done summary', async () => {
    setFakeClient(makeFakeClient({ failChatIds: ids }));
    const io = makeFakeIo();
    await sendCampaign({ chatIds: ids, message: 'Hi', media: null, io, contacts });
    assert.deepEqual(io.byType('send:done')[0].payload, { total: 3, sent: 0, failed: 3 });
  });

  test('empty recipient list completes cleanly with zero counts', async () => {
    setFakeClient(makeFakeClient());
    const io = makeFakeIo();
    await sendCampaign({ chatIds: [], message: 'Hi', media: null, io, contacts });
    assert.deepEqual(io.byType('send:done')[0].payload, { total: 0, sent: 0, failed: 0 });
  });
});

describe('sender.sendCampaign — resilience (expected PASS)', () => {
  test('WhatsApp disconnecting mid-flight (null client) degrades to per-recipient failures, not a crash', async () => {
    setFakeClient(null); // simulate disconnect between route guard and send
    const io = makeFakeIo();

    // Must not throw; each recipient should be reported failed and a summary emitted.
    await assert.doesNotReject(
      sendCampaign({ chatIds: [ids[0]], message: 'Hi', media: null, io, contacts })
    );
    assert.equal(io.progressFor(ids[0]).at(-1).payload.status, 'failed');
    assert.deepEqual(io.byType('send:done')[0].payload, { total: 1, sent: 0, failed: 1 });
  });
});
