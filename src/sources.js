/**
 * Sources — manages the list of saved Google Sheet sources.
 *
 * Persisted to data/settings.json so the list survives restarts.
 * On first run, migrates the hardcoded config.js values as the initial
 * default source so existing setups keep working without any config changes.
 *
 * A "source" is:  { id: string, name: string, tabName: string }
 *   id      — Google Spreadsheet ID (the long string from the sheet URL)
 *   name    — friendly label shown in the UI
 *   tabName — worksheet tab name, or '' for the first/only sheet
 */

const fs   = require('fs');
const path = require('path');
const {
  SHEETS_SPREADSHEET_ID,
  SHEETS_TAB_NAME,
  SHEETS_CREDENTIALS_FILE,
} = require('./config');

const DATA_DIR      = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ── disk I/O ───────────────────────────────────────────────────────────────────

function _read() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!Array.isArray(parsed.sources)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function _write(state) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sources] Failed to save settings:', err.message);
  }
}

// ── initialise ────────────────────────────────────────────────────────────────

let _state = _read();

if (!_state) {
  // First run — migrate from config.js if a sheet ID is configured there
  const defaultSources = SHEETS_SPREADSHEET_ID
    ? [{ id: SHEETS_SPREADSHEET_ID, name: 'Default Sheet', tabName: SHEETS_TAB_NAME || '' }]
    : [];

  _state = { sources: defaultSources, activeIndex: 0 };
  if (defaultSources.length > 0) _write(_state);
}

// ── public API ─────────────────────────────────────────────────────────────────

/** True when credentials are configured and at least one source has an ID. */
function isConfigured() {
  const active = getActive();
  return !!(SHEETS_CREDENTIALS_FILE && active && active.id);
}

/** All saved sources. */
function getAll() {
  return _state.sources;
}

/** Currently active source object, or null. */
function getActive() {
  return _state.sources[_state.activeIndex] || null;
}

/** Index of the currently active source. */
function getActiveIndex() {
  return _state.activeIndex;
}

/**
 * Add a new source.
 * @param {{ id: string, name: string, tabName?: string }} source
 * @returns {number} index of the new source
 */
function add({ id, name, tabName = '' }) {
  if (!id)   throw new Error('Spreadsheet ID is required.');
  if (!name) throw new Error('Source name is required.');
  _state.sources.push({ id, name: name.trim(), tabName: tabName.trim() });
  _write(_state);
  return _state.sources.length - 1;
}

/**
 * Remove a source by index.
 * The active source cannot be removed — switch first.
 */
function remove(index) {
  _validateIndex(index);
  if (index === _state.activeIndex) {
    throw new Error('Cannot remove the active source. Activate another source first.');
  }
  _state.sources.splice(index, 1);
  // Keep activeIndex consistent after removal
  if (_state.activeIndex > index) _state.activeIndex--;
  _write(_state);
}

/**
 * Make a source the active one.
 * @returns {object} the newly active source
 */
function activate(index) {
  _validateIndex(index);
  _state.activeIndex = index;
  _write(_state);
  return _state.sources[index];
}

/**
 * Update the tab name for a source.
 */
function updateTab(index, tabName) {
  _validateIndex(index);
  _state.sources[index].tabName = (tabName || '').trim();
  _write(_state);
}

// ── internal ──────────────────────────────────────────────────────────────────

function _validateIndex(index) {
  if (index < 0 || index >= _state.sources.length) {
    throw new Error(`Source index ${index} is out of range.`);
  }
}

module.exports = { isConfigured, getAll, getActive, getActiveIndex, add, remove, activate, updateTab };
