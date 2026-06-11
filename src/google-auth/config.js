/**
 * Vendor-owned Google OAuth configuration.
 * Loaded in priority order:
 *   1. Baked credentials (Windows release build — locks authMode)
 *   2. Environment variables (dev override when not baked)
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

/** Release builds bake authMode=sso — env cannot override. */
const AUTH_MODE = baked?.authMode
  || (process.env.AUTH_MODE || 'sso').toLowerCase();

const IDENTITY_SCOPES = ['openid', 'email', 'profile'];
const SHEETS_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  ...IDENTITY_SCOPES,
];

module.exports = {
  AUTH_MODE,
  isReleaseBuild: Boolean(baked?.authMode),

  allowlistGcsUri: baked?.allowlistGcsUri
    || process.env.ALLOWLIST_GCS_URI
    || '',

  /** Google Workspace domain, e.g. yourclub.com — optional extra gate */
  hostedDomain: baked?.hostedDomain
    || process.env.GOOGLE_HOSTED_DOMAIN
    || '',

  allowlistCacheMs: Number(process.env.ALLOWLIST_CACHE_MS) || 5 * 60 * 1000,
  sessionMaxAgeMs:  Number(process.env.SESSION_MAX_AGE_MS) || 24 * 60 * 60 * 1000,

  SCOPES: SHEETS_OAUTH_SCOPES,
  IDENTITY_SCOPES,

  clientId,
  clientSecret,
  redirectUri,

  isVendorConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  },

  isSsoMode() {
    return this.AUTH_MODE === 'sso';
  },

  loginScopes() {
    return this.isSsoMode() ? this.IDENTITY_SCOPES : this.SCOPES;
  },

  validateSsoStartup() {
    if (!this.isSsoMode() || !this.isVendorConfigured()) return;
    const errors = [];
    if (!this.allowlistGcsUri) {
      errors.push('ALLOWLIST_GCS_URI is required in SSO mode');
    }
    const serviceAccount = require('./serviceAccount');
    if (!serviceAccount.isConfigured()) {
      errors.push('Service account key (SHEETS_CREDENTIALS_FILE) is required in SSO mode');
    }
    if (errors.length === 0) return;

    const msg = `[google-auth] ${errors.join('; ')}`;
    if (this.isReleaseBuild) {
      console.error(`${msg} — release build cannot start.`);
      process.exit(1);
    }
    console.warn(`${msg} — Google sign-in will fail until configured.`);
  },
};
