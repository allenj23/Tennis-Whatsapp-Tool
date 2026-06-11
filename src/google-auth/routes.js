/**
 * Production Google OAuth API routes (customer-facing path).
 */

const express = require('express');
const config  = require('./config');
const oauth   = require('./oauth');
const userSheets = require('./sheets');
const serviceSheets = require('../sheets');
const spreadsheetAccess = require('./spreadsheetAccess');
const sources = require('../sources');
const sync    = require('../sync');

const router = express.Router();

const PUBLIC_GOOGLE_PATHS = new Set([
  '/google/status',
  '/google/auth/login',
  '/google/auth/callback',
]);

function isPublicGooglePath(path) {
  return PUBLIC_GOOGLE_PATHS.has(path);
}

function requireVendor(_req, res, next) {
  if (!config.isVendorConfigured()) {
    return res.status(503).json({
      error: 'Google sign-in is not configured. Vendor OAuth credentials are missing.',
    });
  }
  next();
}

function requireConnected(req, res, next) {
  if (!oauth.isConnected()) {
    return res.status(401).json({ error: 'Not signed in to Google.' });
  }
  next();
}

/** Gate API routes when SSO mode is active — session + live allowlist check. */
async function requireAppAuth(req, res, next) {
  if (!config.isSsoMode() || !config.isVendorConfigured()) return next();

  if (!oauth.isConnected()) {
    return res.status(401).json({ error: 'Sign in with Google to continue.' });
  }

  try {
    const allowed = await oauth.verifySsoSession();
    if (!allowed) {
      oauth.disconnect();
      return res.status(401).json({
        error: 'Your access was revoked. Sign in again.',
        code:  'access_revoked',
      });
    }
    next();
  } catch (err) {
    console.error('[google-auth] allowlist check failed:', err.message);
    return res.status(503).json({ error: 'Could not verify access. Try again later.' });
  }
}

function sheetsApi() {
  return config.isSsoMode() ? serviceSheets : userSheets;
}

async function fetchTabsMeta(spreadsheetId) {
  if (config.isSsoMode()) {
    return serviceSheets.fetchSheetMeta(spreadsheetId);
  }
  return userSheets.fetchSheetTabs(spreadsheetId);
}

router.get('/api/google/status', (_req, res) => {
  res.json(oauth.getStatus());
});

router.get('/api/google/auth/login', requireVendor, (_req, res) => {
  res.redirect(oauth.getLoginUrl());
});

router.get('/api/google/auth/callback', requireVendor, async (req, res) => {
  const { code, error, state } = req.query;
  if (error) {
    return res.redirect(`/?google_error=${encodeURIComponent(error)}#step-upload`);
  }
  if (!code) {
    return res.redirect('/?google_error=missing_code#step-upload');
  }
  if (!state) {
    return res.redirect('/?google_error=missing_state#step-upload');
  }

  try {
    await oauth.handleCallback(code, state);
    res.redirect('/?google_connected=1#step-upload');
  } catch (err) {
    console.error('[google-auth] callback:', err.message);
    res.redirect(`/?google_error=${encodeURIComponent(err.message)}#step-upload`);
  }
});

router.post('/api/google/disconnect', requireConnected, (_req, res) => {
  oauth.disconnect();
  res.json({ ok: true });
});

router.get('/api/google/spreadsheets', requireVendor, requireConnected, async (_req, res) => {
  try {
    const api = sheetsApi();
    const spreadsheets = await api.listSpreadsheets();
    res.json({ spreadsheets });
  } catch (err) {
    console.error('[google-auth] list spreadsheets:', err.message);
    const status = /sign in|invalid_grant|unauthorized/i.test(err.message) ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/api/google/spreadsheets/:id/tabs', requireVendor, requireConnected, async (req, res) => {
  try {
    if (config.isSsoMode()) {
      await spreadsheetAccess.assertAccessible(req.params.id);
    }
    const meta = await fetchTabsMeta(req.params.id);
    res.json(meta);
  } catch (err) {
    console.error('[google-auth] tabs:', err.message);
    const status = /not available/i.test(err.message) ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/api/google/select-source', requireVendor, requireConnected, async (req, res) => {
  const { spreadsheetId, name, tabName = '' } = req.body || {};
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'spreadsheetId is required.' });
  }

  try {
    if (config.isSsoMode()) {
      await spreadsheetAccess.assertAccessible(spreadsheetId);
    }

    let resolvedTab = String(tabName || '').trim();
    if (!resolvedTab) {
      const meta = await fetchTabsMeta(spreadsheetId);
      resolvedTab = meta.tabs?.[0] || '';
    }

    sources.setActiveSource({
      id: spreadsheetId,
      name: name || 'Google Sheet',
      tabName: resolvedTab,
    });
    sync.triggerNow();
    res.json({
      ok: true,
      sources: sources.getAll(),
      activeIndex: sources.getActiveIndex(),
    });
  } catch (err) {
    const status = /not available/i.test(err.message) ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

function mount(app) {
  config.validateSsoStartup();
  app.use(router);

  const status = oauth.getStatus();
  if (status.vendorConfigured) {
    const modeLabel = status.ssoMode ? 'SSO (identity + hidden service account)' : 'user OAuth';
    console.log(`[google-auth] Vendor OAuth configured — ${modeLabel}`);
    if (status.ssoMode && config.allowlistGcsUri) {
      console.log(`[google-auth] Allow list: ${config.allowlistGcsUri}`);
    }
    if (status.connected) {
      console.log(`[google-auth] Connected as ${status.email || '(unknown)'}`);
    }
  } else {
    console.log('[google-auth] Vendor OAuth not configured — using legacy service-account path only');
  }
}

module.exports = { mount, router, requireAppAuth, isPublicGooglePath };
