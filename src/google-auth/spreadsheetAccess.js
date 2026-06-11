/**
 * SSO mode: spreadsheets must be in the service-account accessible set.
 */

const serviceSheets = require('../sheets');

const CACHE_MS = 2 * 60 * 1000;
let _ids      = null;
let _cachedAt = 0;

async function getAllowedIds(force = false) {
  const now = Date.now();
  if (!force && _ids && (now - _cachedAt) < CACHE_MS) return _ids;

  const list = await serviceSheets.listSpreadsheets();
  _ids      = new Set(list.map((s) => s.id));
  _cachedAt = now;
  return _ids;
}

async function assertAccessible(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('spreadsheetId is required.');

  const allowed = await getAllowedIds();
  if (!allowed.has(id)) {
    throw new Error('This spreadsheet is not available to your organization.');
  }
}

function clearCache() {
  _ids      = null;
  _cachedAt = 0;
}

module.exports = { getAllowedIds, assertAccessible, clearCache };
