/**
 * Persist Google OAuth tokens per installation (encrypted at rest).
 * Path: data/google-connection.json (git-ignored via data/)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

const DATA_DIR  = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'google-connection.json');
const SALT      = 'tennis-whatsapp-tool-google-v1';

let _cached = null;

function _deriveKey() {
  const material = `${os.hostname()}|${os.userInfo().username}|${process.cwd()}`;
  return crypto.scryptSync(SALT, material, 32);
}

function _encrypt(obj) {
  const key  = _deriveKey();
  const iv   = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv:  iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

function _decrypt(blob) {
  const key = _deriveKey();
  const iv  = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const data = Buffer.from(blob.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function load() {
  if (_cached) return _cached;
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const blob = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    _cached = _decrypt(blob);
    return _cached;
  } catch (err) {
    console.warn('[google-auth] Could not load connection (re-sign-in required):', err.message);
    return null;
  }
}

function save(connection) {
  _cached = connection;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(_encrypt(connection), null, 2), 'utf8');
  } catch (err) {
    console.warn('[google-auth] Failed to save connection:', err.message);
  }
}

function clear() {
  _cached = null;
  try {
    if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
  } catch (err) {
    console.warn('[google-auth] Failed to clear connection:', err.message);
  }
}

function getTokens() {
  return load()?.tokens || null;
}

function getProfile() {
  return load()?.profile || { email: '' };
}

function updateTokens(tokens) {
  const conn = load() || { profile: { email: '' }, connectedAt: new Date().toISOString() };
  conn.tokens = { ...conn.tokens, ...tokens };
  save(conn);
}

function setConnection(tokens, profile) {
  save({
    tokens,
    profile: profile || { email: '' },
    connectedAt: new Date().toISOString(),
  });
}

module.exports = {
  load,
  save,
  clear,
  getTokens,
  getProfile,
  updateTokens,
  setConnection,
};
