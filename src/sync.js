/**
 * Google Sheets polling service.
 *
 * Polls the active source (from sources.js) on a configurable interval.
 * Switching sources cancels the current timer and starts a fresh poll
 * against the new spreadsheet/tab immediately.
 */

const sheets      = require('./sheets');
const googleOAuth = require('./google-auth/oauth');
const googleSheets = require('./google-auth/sheets');
const sources     = require('./sources');
const { buildContacts, setContacts } = require('./excel');
const cache   = require('./cache');
const { SHEETS_POLL_INTERVAL_MS } = require('./config');

const BASE_INTERVAL_MS = SHEETS_POLL_INTERVAL_MS;
const MAX_BACKOFF_MS   = 10 * 60 * 1000; // 10 minutes

// ── module state ───────────────────────────────────────────────────────────────
let _io           = null;
let _timer        = null;
let _failureCount = 0;
let _lastStatus   = { status: 'idle' };

// ── helpers ────────────────────────────────────────────────────────────────────

function _setStatus(s)          { _lastStatus = s; }
function _broadcast(event, data) {
  if (!_io) return;
  const { broadcastTarget } = require('./google-auth/socketAuth');
  broadcastTarget(_io).emit(event, data);
}

function _scheduleNext(delayMs) {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(_runPoll, delayMs);
}

function _useOAuth() {
  const googleCfg = require('./google-auth/config');
  if (googleCfg.isSsoMode()) return false;
  return googleOAuth.isConnected();
}

async function _fetchRows(spreadsheetId, tabName) {
  if (_useOAuth()) return googleSheets.fetchRows(spreadsheetId, tabName);
  return sheets.fetchRows(spreadsheetId, tabName);
}

async function _fetchSheetTabs(spreadsheetId) {
  if (_useOAuth()) {
    const meta = await googleSheets.fetchSheetTabs(spreadsheetId);
    return meta.tabs;
  }
  return sheets.fetchSheetTabs(spreadsheetId);
}

async function _fetchSheetTitle(spreadsheetId) {
  if (_useOAuth()) return googleSheets.fetchSheetTitle(spreadsheetId);
  return sheets.fetchSheetTitle(spreadsheetId);
}

// ── core poll ──────────────────────────────────────────────────────────────────

async function _runPoll() {
  if (!sources.isConfigured()) return;

  const source = sources.getActive();
  if (!source) return;

  _broadcast('sync:status', { status: 'syncing', sheetTitle: source.name });

  try {
    // ── Fetch rows: single tab or all-tabs merge ─────────────────────────────
    let rows;
    if (source.tabName === '__all__') {
      const tabs = await _fetchSheetTabs(source.id);
      rows = [];
      for (const t of tabs) {
        rows.push(...await _fetchRows(source.id, t));
      }
    } else {
      rows = await _fetchRows(source.id, source.tabName);
    }

    const result = buildContacts(rows);

    // Fetch the real spreadsheet title once per source (cosmetic, non-critical)
    let sheetTitle = source.name;
    try {
      sheetTitle = await _fetchSheetTitle(source.id);
    } catch { /* keep friendly name as fallback */ }

    const status = {
      status:      'ok',
      sheetTitle,
      activeIndex: sources.getActiveIndex(),
      syncedAt:    new Date().toISOString(),
      total:       result.contacts.length,
      skipped:     result.skipped.length,
    };

    _setStatus(status);
    _failureCount = 0;

    cache.save({
      contacts:   result.contacts,
      groups:     result.groups,
      syncedAt:   status.syncedAt,
      sheetTitle,
    });

    _broadcast('contacts:loaded', result);
    _broadcast('sync:status', status);

    _scheduleNext(BASE_INTERVAL_MS);
  } catch (err) {
    _failureCount++;
    const backoffMs = Math.min(
      BASE_INTERVAL_MS * Math.pow(2, _failureCount - 1),
      MAX_BACKOFF_MS
    );

    const status = {
      status:      'error',
      sheetTitle:  source.name,
      activeIndex: sources.getActiveIndex(),
      message:     err.message,
    };

    _setStatus(status);
    _broadcast('sync:status', status);

    console.error(
      `[sync] Poll failed (attempt ${_failureCount}), ` +
      `retrying in ${Math.round(backoffMs / 1000)}s — ${err.message}`
    );

    _scheduleNext(backoffMs);
  }
}

// ── public API ─────────────────────────────────────────────────────────────────

/**
 * Start the polling loop. Call once after the HTTP server begins listening.
 */
function start(io) {
  _io = io;
  if (!sources.isConfigured()) return;

  // Restore from disk cache so contacts are available before the first poll.
  const cached = cache.load();
  if (cached) {
    setContacts(cached.contacts, cached.groups);
    _setStatus({
      status:     'ok',
      sheetTitle: cached.sheetTitle,
      syncedAt:   cached.syncedAt,
      total:      cached.contacts.length,
      skipped:    0,
    });
    console.log(`[sync] Restored ${cached.contacts.length} contacts from cache (${cached.syncedAt})`);
  }

  console.log(`[sync] Starting — polling every ${BASE_INTERVAL_MS / 1000}s`);
  _runPoll();
}

/** Stop the polling loop (tests / graceful shutdown). */
function stop() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
}

/**
 * Force an immediate sync on the current active source.
 * Called by the manual "Sync now" button and by switchSource().
 */
function triggerNow() {
  if (_timer) clearTimeout(_timer);
  _failureCount = 0; // reset backoff for manual triggers
  _runPoll();
}

/**
 * Switch the active source and immediately poll the new one.
 * @param {number} index  Index into the sources list.
 */
function switchSource(index) {
  sources.activate(index);
  _failureCount = 0;
  triggerNow();
}

/** Current sync status — sent to newly connecting browsers. */
function getStatus() {
  return { ..._lastStatus };
}

module.exports = { start, stop, triggerNow, switchSource, getStatus };
