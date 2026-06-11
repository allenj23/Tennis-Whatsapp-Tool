/**
 * Allowed-user list stored in Google Cloud Storage (vendor-managed).
 *
 * GCS object format (JSON):
 * { "emails": ["staff1@club.com", "staff2@club.com"] }
 *
 * The service account must have storage.objects.get on the bucket.
 */

const { google } = require('googleapis');
const config     = require('./config');
const serviceAccount = require('./serviceAccount');

let _cache     = null;
let _cachedAt  = 0;

function _parseGcsUri(uri) {
  const match = String(uri || '').match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid ALLOWLIST_GCS_URI: ${uri}. Expected gs://bucket/path/to/file.json`);
  }
  return { bucket: match[1], object: match[2] };
}

function _normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function _fetchFromGcs() {
  if (!config.allowlistGcsUri) {
    throw new Error('Allow list is not configured (ALLOWLIST_GCS_URI).');
  }
  if (!serviceAccount.isConfigured()) {
    throw new Error('Service account is not configured for allow-list lookup.');
  }

  const { bucket, object } = _parseGcsUri(config.allowlistGcsUri);
  const auth    = serviceAccount.getAuth();
  const storage = google.storage({ version: 'v1', auth });

  const res = await storage.objects.get({
    bucket,
    object,
    alt: 'media',
  }, { responseType: 'text' });

  let raw = res.data;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  else if (typeof raw !== 'string') raw = JSON.stringify(raw);
  const doc = JSON.parse(raw);

  const emails = (doc.emails || []).map(_normalizeEmail).filter(Boolean);
  return { emails: new Set(emails) };
}

async function getConfig(force = false) {
  const now = Date.now();
  if (!force && _cache && (now - _cachedAt) < config.allowlistCacheMs) {
    return _cache;
  }

  _cache    = await _fetchFromGcs();
  _cachedAt = now;
  return _cache;
}

async function isEmailAllowed(email) {
  if (!config.isSsoMode()) return true;

  const doc = await getConfig();
  return doc.emails.has(_normalizeEmail(email));
}

function clearCache() {
  _cache    = null;
  _cachedAt = 0;
}

module.exports = {
  isEmailAllowed,
  getConfig,
  clearCache,
};
