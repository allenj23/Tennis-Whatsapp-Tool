/**
 * Google Sheets connector — read-only, service-account auth.
 *
 * All public functions accept spreadsheetId (and tabName where relevant)
 * as explicit parameters so the active source can be switched at runtime
 * without restarting the process.
 *
 * Credentials still come from config.js (SHEETS_CREDENTIALS_FILE).
 * Whether Sheets is enabled at all is determined by src/sources.js.
 */

const path   = require('path');
const fs     = require('fs');
const { google } = require('googleapis');
const { SHEETS_CREDENTIALS_FILE } = require('./config');

// ── auth ───────────────────────────────────────────────────────────────────────

/**
 * Build an authenticated Google API client from the service-account key file.
 * Throws a descriptive error if the file is missing.
 */
function makeAuthClient() {
  const credPath = path.isAbsolute(SHEETS_CREDENTIALS_FILE)
    ? SHEETS_CREDENTIALS_FILE
    : path.resolve(process.cwd(), SHEETS_CREDENTIALS_FILE);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Service-account key file not found: ${credPath}\n` +
      'Set SHEETS_CREDENTIALS_FILE in src/config.js.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ── public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch all data rows from a Google Sheet.
 *
 * Returns plain objects with keys matching the header row (capitalised so
 * getField() in excel.js finds them case-insensitively).
 *
 * @param {string}  spreadsheetId
 * @param {string}  [tabName]  Worksheet tab name; '' or undefined → first sheet
 * @returns {Promise<object[]>}
 */
async function fetchRows(spreadsheetId, tabName) {
  const auth   = makeAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = tabName ? `'${tabName}'` : 'A:ZZZ';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const values = response.data.values || [];
  if (values.length === 0) return [];

  const [headerRow, ...dataRows] = values;
  const headers = headerRow.map((h) => String(h ?? '').trim().toLowerCase());

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        const key = header.charAt(0).toUpperCase() + header.slice(1);
        obj[key] = String(row[i] ?? '').trim();
      });
      return obj;
    });
}

/**
 * Fetch the human-readable title of a spreadsheet.
 * Used to display the sheet name in the sources panel.
 *
 * @param {string} spreadsheetId
 * @returns {Promise<string>}
 */
async function fetchSheetTitle(spreadsheetId) {
  const auth      = makeAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title',
  });

  return response.data.properties.title || spreadsheetId;
}

/**
 * List all worksheet tab names within a spreadsheet.
 * Used to populate the tab dropdown in the sources panel.
 *
 * @param {string} spreadsheetId
 * @returns {Promise<string[]>}  e.g. ['Sheet1', 'Kids', 'Adults']
 */
async function fetchSheetTabs(spreadsheetId) {
  const auth      = makeAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  return (response.data.sheets || []).map((s) => s.properties.title);
}

module.exports = { fetchRows, fetchSheetTitle, fetchSheetTabs };
