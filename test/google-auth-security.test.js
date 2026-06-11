'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('oauthPending', () => {
  const pending = require('../src/google-auth/oauthPending');

  beforeEach(() => pending.clear());

  it('consumes matching state once', () => {
    pending.setPending({ state: 'abc', codeVerifier: 'verifier123' });
    assert.strictEqual(pending.consume('abc'), 'verifier123');
    assert.strictEqual(pending.consume('abc'), null);
  });

  it('rejects unknown state', () => {
    pending.setPending({ state: 'abc', codeVerifier: 'verifier123' });
    assert.strictEqual(pending.consume('wrong'), null);
  });
});

describe('isPublicGooglePath', () => {
  const { isPublicGooglePath } = require('../src/google-auth/routes');

  it('allows status and auth routes only', () => {
    assert.strictEqual(isPublicGooglePath('/google/status'), true);
    assert.strictEqual(isPublicGooglePath('/google/auth/login'), true);
    assert.strictEqual(isPublicGooglePath('/google/auth/callback'), true);
    assert.strictEqual(isPublicGooglePath('/google/disconnect'), false);
    assert.strictEqual(isPublicGooglePath('/google/spreadsheets'), false);
  });
});

describe('dataCrypto', () => {
  const { encrypt, decrypt } = require('../src/dataCrypto');

  it('round-trips encrypted payloads', () => {
    const payload = { contacts: [{ name: 'Test' }], groups: ['A'] };
    const blob = encrypt('test-salt-v1', payload);
    assert.deepStrictEqual(decrypt('test-salt-v1', blob), payload);
  });
});

describe('cache encryption', () => {
  const fs   = require('fs');
  const path = require('path');
  const os   = require('os');

  it('migrates legacy plain JSON to encrypted format', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-cache-test-'));
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const legacy = {
      contacts: [{ name: 'Legacy', chatId: '1@c.us', group: 'G' }],
      groups: ['G'],
      syncedAt: new Date().toISOString(),
      sheetTitle: 'Sheet',
    };
    fs.writeFileSync(path.join(dataDir, 'contacts-cache.json'), JSON.stringify(legacy));

    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      delete require.cache[require.resolve('../src/cache')];
      const cache = require('../src/cache');
      const loaded = cache.load();
      assert.strictEqual(loaded.contacts[0].name, 'Legacy');

      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'contacts-cache.json'), 'utf8'));
      assert.strictEqual(raw.v, 1);
      assert.ok(raw.data);
    } finally {
      process.chdir(cwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete require.cache[require.resolve('../src/cache')];
    }
  });
});

describe('spreadsheetAccess', () => {
  it('exports assertAccessible helper', () => {
    const mod = require('../src/google-auth/spreadsheetAccess');
    assert.strictEqual(typeof mod.assertAccessible, 'function');
    assert.strictEqual(typeof mod.getAllowedIds, 'function');
  });
});
