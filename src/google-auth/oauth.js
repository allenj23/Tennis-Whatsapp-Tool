/**
 * Google OAuth2 client lifecycle: login URL, callback, refresh, authenticated client.
 */

const crypto   = require('crypto');
const { google } = require('googleapis');
const config     = require('./config');
const tokenStore = require('./tokenStore');
const allowlist  = require('./allowlist');
const oauthPending = require('./oauthPending');

function createOAuthClient() {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

function _pkcePair() {
  const codeVerifier  = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function getLoginUrl() {
  const client = createOAuthClient();
  const state  = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = _pkcePair();

  oauthPending.setPending({ state, codeVerifier });

  const opts = {
    scope:                 config.loginScopes(),
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
  };

  if (config.isSsoMode()) {
    opts.prompt = 'select_account';
    if (config.hostedDomain) {
      opts.hd = config.hostedDomain.replace(/^@/, '');
    }
  } else {
    opts.access_type = 'offline';
    opts.prompt      = 'consent';
  }

  return client.generateAuthUrl(opts);
}

function _validateProfile(data) {
  const email = String(data.email || '').trim();
  const emailVerified = data.verified_email === true;
  const hd = String(data.hd || '').trim().toLowerCase();

  if (!email) {
    throw new Error('Could not read your Google account email. Try signing in again.');
  }
  if (!emailVerified) {
    throw new Error('Your Google account email is not verified.');
  }

  if (config.hostedDomain) {
    const domain = config.hostedDomain.replace(/^@/, '').toLowerCase();
    const emailDomain = email.split('@')[1]?.toLowerCase() || '';
    if (hd !== domain && emailDomain !== domain) {
      throw new Error(`Sign in with your @${domain} Google account.`);
    }
  }

  return { email, emailVerified, hd };
}

async function handleCallback(code, state) {
  const codeVerifier = oauthPending.consume(state);
  if (!codeVerifier) {
    throw new Error('Invalid or expired sign-in session. Please try again.');
  }

  const client = createOAuthClient();
  const { tokens } = await client.getToken({ code, codeVerifier });
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  let profile  = { email: '' };
  try {
    const { data } = await oauth2.userinfo.get();
    profile = _validateProfile(data);
  } catch (err) {
    if (err.message?.includes('Sign in with') || err.message?.includes('not verified')) {
      throw err;
    }
    throw new Error('Could not read your Google account email. Try signing in again.');
  }

  if (config.isSsoMode()) {
    const allowed = await allowlist.isEmailAllowed(profile.email);
    if (!allowed) {
      throw new Error('Your Google account is not authorized to use this app.');
    }
    tokenStore.setSession(profile);
    return profile;
  }

  tokenStore.setConnection(tokens, profile);
  return profile;
}

function isConnected() {
  if (config.isSsoMode()) {
    return tokenStore.isSessionValid(config.sessionMaxAgeMs);
  }
  return Boolean(tokenStore.getTokens()?.refresh_token);
}

/** Re-check allow list for an active SSO session (fail closed on GCS errors). */
async function verifySsoSession() {
  if (!config.isSsoMode()) return true;
  if (!isConnected()) return false;

  const email = tokenStore.getProfile().email;
  if (!email) return false;

  return allowlist.isEmailAllowed(email);
}

/**
 * Returns an OAuth2 client with valid credentials, refreshing if needed.
 * Persists refreshed tokens to disk.
 */
async function getAuthenticatedClient() {
  const tokens = tokenStore.getTokens();
  if (!tokens) {
    throw new Error('Not signed in to Google. Use Sign in with Google in Step 2.');
  }

  const client = createOAuthClient();
  client.setCredentials(tokens);

  client.on('tokens', (fresh) => {
    tokenStore.updateTokens(fresh);
  });

  if (!tokens.access_token || _isExpired(tokens)) {
    const { credentials } = await client.refreshAccessToken();
    tokenStore.updateTokens(credentials);
    client.setCredentials(credentials);
  }

  return client;
}

function _isExpired(tokens) {
  if (!tokens.expiry_date) return false;
  return Date.now() >= tokens.expiry_date - 60_000;
}

function disconnect() {
  oauthPending.clear();
  tokenStore.clear();
}

function getStatus() {
  const profile = tokenStore.getProfile();
  return {
    vendorConfigured: config.isVendorConfigured(),
    authMode:         config.AUTH_MODE,
    ssoMode:          config.isSsoMode(),
    connected:        isConnected(),
    email:            profile.email || '',
    connectedAt:      tokenStore.load()?.connectedAt || null,
    scopes:           config.loginScopes(),
  };
}

module.exports = {
  getLoginUrl,
  handleCallback,
  getAuthenticatedClient,
  isConnected,
  verifySsoSession,
  disconnect,
  getStatus,
};
