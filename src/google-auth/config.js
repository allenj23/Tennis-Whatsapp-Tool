/**
 * Vendor-owned Google OAuth configuration.
 * Loaded in priority order:
 *   1. Environment variables (dev override)
 *   2. Baked credentials (Windows release build)
 *   3. vendor-google-oauth.json on disk (local dev)
 * Customers never configure this.
 */

const path = require('path');
const fs   = require('fs');

const { PORT } = require('../config');

let baked = null;
try {
  baked = require('./baked-credentials');
} catch {
  baked = null;
}

const CANDIDATE_FILES = [
  process.env.GOOGLE_OAUTH_CREDENTIALS_FILE || 'vendor-google-oauth.json',
  'oauth-spike.credentials.json',
];

function loadFileCredentials() {
  for (const name of CANDIDATE_FILES) {
    const credPath = path.isAbsolute(name) ? name : path.resolve(process.cwd(), name);
    if (!fs.existsSync(credPath)) continue;

    const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const web = raw.web || raw.installed || raw;
    return {
      clientId:     web.client_id     || '',
      clientSecret: web.client_secret || '',
      redirectUri:  (web.redirect_uris && web.redirect_uris[0]) || '',
    };
  }
  return null;
}

function defaultRedirectUri() {
  return `http://127.0.0.1:${PORT}/api/google/auth/callback`;
}

const fileCreds = loadFileCredentials();

const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID
  || baked?.clientId
  || fileCreds?.clientId
  || '';

const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  || baked?.clientSecret
  || fileCreds?.clientSecret
  || '';

const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI
  || baked?.redirectUri
  || fileCreds?.redirectUri
  || defaultRedirectUri();

module.exports = {
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'openid',
    'email',
  ],

  clientId,
  clientSecret,
  redirectUri,

  isVendorConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  },
};
