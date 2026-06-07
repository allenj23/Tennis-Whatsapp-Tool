/**
 * Google Sheets connector — read-only, service-account auth.
 *
 * Only active when SHEETS_SPREADSHEET_ID and SHEETS_CREDENTIALS_FILE
 * are set in config.js / environment.  Everything else in the app is
 * unaffected when those values are empty.
 */

const path   = require('path');
const fs     = require('fs');
const { google } = require('googleapis');
const {
  SHEETS_SPREADSHEET_ID,
  SHEETS_CREDENTIALS_FILE,
  SHEETS_TAB_NAME,
} = require('./config');

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns true when both required config values are present.
 * The UI and server route check this before showing / calling anything.
 */
function isConfigured() {
  return !!(SHEETS_SPREADSHEET_ID && SHEETS_CREDENTIALS_FILE);
}

/**
 * Build an authenticated Google API client from the service-account key file.
 * Throws a clear message if the file is missing.
 */
function makeAuthClient() {
  const credPath = path.isAbsolute(SHEETS_CREDENTIALS_FILE)
    ? SHEETS_CREDENTIALS_FILE
    : path.resolve(process.cwd(), SHEETS_CREDENTIALS_FILE);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Service-account key file not found: ${credPath}\n` +
      'Download it from the Google Cloud Console and set SHEETS_CREDENTIALS_FILE in config.js.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ── public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch all data rows from the configured Google Sheet.
 *
 * Returns an array of plain objects with keys "Name", "Phone", "Group"
 * (capitalised so getField() in excel.js finds them via its case-insensitive
 * lookup with candidates ['name'], ['phone'], ['group']).
 *
 * The first row of the sheet is treated as the header row.
 * Any columns beyond Name/Phone/Group are silently ignored.
 *
 * @returns {Promise<object[]>}  e.g. [{ Name:'Alice', Phone:'0501111111', Group:'Members' }, ...]
 * @throws  if not configured, credentials missing, or the API call fails.
 */
async function fetchRows() {
  if (!isConfigured()) {
    throw new Error(
      'Google Sheets is not configured. ' +
      'Set SHEETS_SPREADSHEET_ID and SHEETS_CREDENTIALS_FILE in src/config.js.'
    );
  }

  const auth   = makeAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // If a tab name is configured, use it; otherwise fall back to the first visible sheet.
  const range = SHEETS_TAB_NAME ? `'${SHEETS_TAB_NAME}'` : 'A:ZZZ';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    range,
    valueRenderOption: 'FORMATTED_VALUE', // get display strings, not raw types
  });

  const values = response.data.values || [];
  if (values.length === 0) {
    return []; // empty sheet — buildContacts([]) handles this gracefully
  }

  const [headerRow, ...dataRows] = values;

  // Normalise header names to lowercase for robust matching
  const headers = headerRow.map((h) => String(h ?? '').trim().toLowerCase());

  // Map each data row into a plain object keyed by header name.
  // Use capitalised keys so getField()'s toLower comparison matches:
  //   getField(row, ['name'])  ← row.Name → 'name' === 'name' ✓
  const rows = dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== '')) // skip blank rows
    .map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        // Capitalise first letter so getField() case-insensitive lookup works
        const key = header.charAt(0).toUpperCase() + header.slice(1);
        obj[key] = String(row[i] ?? '').trim();
      });
      return obj;
    });

  return rows;
}

/**
 * Fetch the last-modified timestamp of the spreadsheet file via the Drive API.
 * Used by the polling loop (Phase 2) to skip full row fetches when nothing changed.
 *
 * @returns {Promise<string>}  ISO-8601 string, e.g. "2026-06-07T09:34:12.000Z"
 * @throws  if not configured or the API call fails.
 */
async function fetchModifiedTime() {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured.');
  }

  const auth  = makeAuthClient();
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });

  const response = await drive.files.get({
    fileId: SHEETS_SPREADSHEET_ID,
    fields: 'modifiedTime',
    supportsAllDrives: true,
  });

  return response.data.modifiedTime; // ISO string
}

/**
 * Fetch the human-readable title of the spreadsheet (e.g. "Tennis Club Contacts").
 * Displayed in the sync-status panel so staff can confirm the right sheet is connected.
 *
 * @returns {Promise<string>}
 */
async function fetchSheetTitle() {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured.');
  }

  const auth     = makeAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    fields: 'properties.title',
  });

  return response.data.properties.title || SHEETS_SPREADSHEET_ID;
}

module.exports = { isConfigured, fetchRows, fetchModifiedTime, fetchSheetTitle };
