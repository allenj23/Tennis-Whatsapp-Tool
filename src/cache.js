/**
 * Simple disk cache for the last successfully synced contact list.
 *
 * Stored at data/contacts-cache.json (git-ignored).
 * Lets the app serve contacts immediately on restart, even before the
 * first Google Sheets poll completes (or if the sheet is temporarily unreachable).
 */

const fs   = require('fs');
const path = require('path');

const CACHE_DIR  = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'contacts-cache.json');

/**
 * Persist the contact list to disk.  Failures are logged but never thrown —
 * caching is best-effort and must not break the main sync path.
 *
 * @param {{ contacts: object[], groups: string[], syncedAt: string, sheetTitle: string|null }} data
 */
function save(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cache] Failed to save:', err.message);
  }
}

/**
 * Load the last saved contact list from disk.
 * Returns null if no cache exists or if the file is corrupt.
 *
 * @returns {{ contacts: object[], groups: string[], syncedAt: string, sheetTitle: string|null } | null}
 */
function load() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw  = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Basic sanity check — must have a contacts array
    if (!Array.isArray(data.contacts)) return null;
    return data;
  } catch (err) {
    console.warn('[cache] Failed to load:', err.message);
    return null;
  }
}

module.exports = { save, load };
