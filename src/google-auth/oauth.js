/**
 * Google OAuth2 client lifecycle: login URL, callback, refresh, authenticated client.
 */

const { google } = require('googleapis');
const config     = require('./config');
const tokenStore = require('./tokenStore');

function createOAuthClient() {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

function getLoginUrl() {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt:         'consent',
    scope:          config.SCOPES,
  });
}

async function handleCallback(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  let profile  = { email: '' };
  try {
    const { data } = await oauth2.userinfo.get();
    profile = { email: data.email || '' };
  } catch {
    /* non-fatal */
  }

  tokenStore.setConnection(tokens, profile);
  return profile;
}

function isConnected() {
  return Boolean(tokenStore.getTokens()?.refresh_token);
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

  // Proactively refresh if access token missing or near expiry
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
  tokenStore.clear();
}

function getStatus() {
  const profile = tokenStore.getProfile();
  return {
    vendorConfigured: config.isVendorConfigured(),
    connected:        isConnected(),
    email:            profile.email || '',
    connectedAt:      tokenStore.load()?.connectedAt || null,
    scopes:           config.SCOPES,
  };
}

module.exports = {
  getLoginUrl,
  handleCallback,
  getAuthenticatedClient,
  isConnected,
  disconnect,
  getStatus,
};
