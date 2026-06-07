/**
 * Production Google OAuth API routes (customer-facing path).
 */

const express = require('express');
const config  = require('./config');
const oauth   = require('./oauth');
const sheets  = require('./sheets');
const sources = require('../sources');
const sync    = require('../sync');

const router = express.Router();

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

router.get('/api/google/status', (_req, res) => {
  res.json(oauth.getStatus());
});

router.get('/api/google/auth/login', requireVendor, (_req, res) => {
  res.redirect(oauth.getLoginUrl());
});

router.get('/api/google/auth/callback', requireVendor, async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect(`/?google_error=${encodeURIComponent(error)}#step-upload`);
  }
  if (!code) {
    return res.redirect('/?google_error=missing_code#step-upload');
  }

  try {
    await oauth.handleCallback(code);
    res.redirect('/?google_connected=1#step-upload');
  } catch (err) {
    console.error('[google-auth] callback:', err.message);
    res.redirect(`/?google_error=${encodeURIComponent(err.message)}#step-upload`);
  }
});

router.post('/api/google/disconnect', (_req, res) => {
  oauth.disconnect();
  res.json({ ok: true });
});

router.get('/api/google/spreadsheets', requireVendor, requireConnected, async (_req, res) => {
  try {
    const spreadsheets = await sheets.listSpreadsheets();
    res.json({ spreadsheets });
  } catch (err) {
    console.error('[google-auth] list spreadsheets:', err.message);
    const status = /sign in|invalid_grant|unauthorized/i.test(err.message) ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/api/google/spreadsheets/:id/tabs', requireVendor, requireConnected, async (req, res) => {
  try {
    const meta = await sheets.fetchSheetTabs(req.params.id);
    res.json(meta);
  } catch (err) {
    console.error('[google-auth] tabs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/google/select-source', requireVendor, requireConnected, async (req, res) => {
  const { spreadsheetId, name, tabName = '' } = req.body || {};
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'spreadsheetId is required.' });
  }

  try {
    let resolvedTab = String(tabName || '').trim();
    if (!resolvedTab) {
      const meta = await sheets.fetchSheetTabs(spreadsheetId);
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
    res.status(400).json({ error: err.message });
  }
});

function mount(app) {
  app.use(router);
  const status = oauth.getStatus();
  if (status.vendorConfigured) {
    console.log('[google-auth] Vendor OAuth configured — customer sign-in enabled');
    if (status.connected) {
      console.log(`[google-auth] Connected as ${status.email || '(unknown)'}`);
    }
  } else {
    console.log('[google-auth] Vendor OAuth not configured — using legacy service-account path only');
  }
}

module.exports = { mount, router };
