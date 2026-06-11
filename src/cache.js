/**
 * Encrypted disk cache for the last successfully synced contact list.
 * Path: data/contacts-cache.json (git-ignored).
 */

const fs   = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./dataCrypto');

const CACHE_DIR  = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'contacts-cache.json');
const SALT       = 'tennis-whatsapp-tool-cache-v1';

function save(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(encrypt(SALT, data), null, 2), 'utf8');
  } catch (err) {
    console.warn('[cache] Failed to save:', err.message);
  }
}

function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;

    const raw  = fs.readFileSync(CACHE_FILE, 'utf8');
    const blob = JSON.parse(raw);

    if (blob.v === 1 && blob.iv && blob.tag && blob.data) {
      const data = decrypt(SALT, blob);
      if (!Array.isArray(data.contacts)) return null;
      return data;
    }

    // Legacy plain JSON — read once, re-save encrypted
    const legacy = blob;
    if (!Array.isArray(legacy.contacts)) return null;
    save(legacy);
    return legacy;
  } catch (err) {
    console.warn('[cache] Failed to load:', err.message);
    return null;
  }
}

module.exports = { save, load };
