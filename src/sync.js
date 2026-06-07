/**
 * Google Sheets polling service.
 *
 * Responsibilities:
 *   - Poll for sheet changes every SHEETS_POLL_INTERVAL_MS.
 *   - Use modifiedTime (cheap Drive call) to skip full row fetches when nothing changed.
 *   - On change: fetch rows → buildContacts() → broadcast contacts:loaded + sync:status.
 *   - On failure: keep last-good contact data, emit sync:status error, back off exponentially.
 *   - Expose triggerNow() for the manual "Sync now" button (forces a full fetch).
 *   - Expose getStatus() so late-connecting browsers get the current state immediately.
 */

const sheets  = require('./sheets');
const { buildContacts, setContacts } = require('./excel');
const cache   = require('./cache');
const { SHEETS_POLL_INTERVAL_MS } = require('./config');

const BASE_INTERVAL_MS = SHEETS_POLL_INTERVAL_MS;
const MAX_BACKOFF_MS   = 10 * 60 * 1000; // 10 minutes

// ── module state ───────────────────────────────────────────────────────────────
let _io           = null;
let _timer        = null;
let _sheetTitle   = null;  // human-readable name fetched on first success
let _failureCount     = 0;
let _lastStatus       = { status: 'idle' };

// ── helpers ────────────────────────────────────────────────────────────────────

function _setStatus(s) {
  _lastStatus = s;
}

function _broadcast(event, data) {
  if (_io) _io.emit(event, data);
}

function _scheduleNext(delayMs) {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(_runPoll, delayMs);
}

// ── core poll ──────────────────────────────────────────────────────────────────

async function _runPoll() {
  if (!sheets.isConfigured()) return;

  _broadcast('sync:status', { status: 'syncing', sheetTitle: _sheetTitle });

  try {
    // ── Step 1: fetch full rows and build the contact list ───────────────────
    // modifiedTime optimisation skipped (requires Drive API scope).
    // Full row fetch on every tick is fine at the default 60-second interval.
    const rows   = await sheets.fetchRows();
    const result = buildContacts(rows);

    // ── Step 3: fetch the sheet title once (non-critical) ────────────────────
    if (!_sheetTitle) {
      try {
        _sheetTitle = await sheets.fetchSheetTitle();
      } catch {
        // title is cosmetic — don't fail the sync if this call fails
        _sheetTitle = null;
      }
    }

    // ── Step 4: broadcast results ────────────────────────────────────────────
    const status = {
      status:     'ok',
      sheetTitle: _sheetTitle,
      syncedAt:   new Date().toISOString(),
      total:      result.contacts.length,
      skipped:    result.skipped.length,
    };

    _setStatus(status);
    _failureCount = 0;

    // Persist to disk so the next restart can serve contacts immediately
    cache.save({
      contacts:   result.contacts,
      groups:     result.groups,
      syncedAt:   status.syncedAt,
      sheetTitle: _sheetTitle,
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
      status:     'error',
      sheetTitle: _sheetTitle,
      message:    err.message,
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
 * Start the polling loop.  Call once after the HTTP server is listening.
 * Safe to call even when Sheets is not configured (does nothing).
 *
 * @param {import('socket.io').Server} io
 */
function start(io) {
  _io = io;
  if (!sheets.isConfigured()) return;

  // Restore from disk cache so contacts are available immediately —
  // before the first network poll finishes (or if the sheet is unreachable).
  const cached = cache.load();
  if (cached) {
    setContacts(cached.contacts, cached.groups);
    _sheetTitle = cached.sheetTitle || null;
    _setStatus({
      status:     'ok',
      sheetTitle: _sheetTitle,
      syncedAt:   cached.syncedAt,
      total:      cached.contacts.length,
      skipped:    0,
    });
    console.log(`[sync] Restored ${cached.contacts.length} contacts from cache (${cached.syncedAt})`);
  }

  console.log(`[sync] Starting — polling every ${BASE_INTERVAL_MS / 1000}s`);
  _runPoll(); // immediate first poll to get the latest data
}

/**
 * Stop the polling loop (used in tests / graceful shutdown).
 */
function stop() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
}

/**
 * Force an immediate sync, cancelling the current scheduled tick.
 * Called by the manual "Sync now" button route.
 * Fire-and-forget — result arrives via socket events.
 */
function triggerNow() {
  if (_timer) clearTimeout(_timer);
  _runPoll();
}

/**
 * Return the last known sync status.
 * Server emits this to newly connecting browsers so they see the right state
 * immediately without waiting for the next poll tick.
 */
function getStatus() {
  return { ..._lastStatus };
}

module.exports = { start, stop, triggerNow, getStatus };
