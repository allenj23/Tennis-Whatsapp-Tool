/**
 * Google Sheets connector — read-only, service-account auth.
 *
 * All public functions accept spreadsheetId (and tabName where relevant)
 * as explicit parameters so the active source can be switched at runtime
 * without restarting the process.
 */

const { google } = require('googleapis');
const serviceAccount = require('./google-auth/serviceAccount');

function makeAuthClient() {
  return serviceAccount.getAuth();
}

function _escapeTabName(tabName) {
  return String(tabName).replace(/'/g, "''");
}

/**
 * List spreadsheets shared with the vendor service account.
 */
async function listSpreadsheets() {
  const auth  = makeAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q:        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields:   'files(id, name, modifiedTime)',
    orderBy:  'modifiedTime desc',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).map((f) => ({
    id:           f.id,
    name:         f.name,
    modifiedTime: f.modifiedTime,
  }));
}

async function fetchRows(spreadsheetId, tabName) {
  const auth   = makeAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = tabName ? `'${_escapeTabName(tabName)}'` : 'A:ZZZ';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const values = response.data.values || [];
  if (values.length === 0) return [];

  const [headerRow, ...dataRows] = values;

  const normalizeHeader = (h) =>
    String(h ?? '')
      .replace(/[\u200b-\u200f\u202a-\u202e\u00a0\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const headers = headerRow.map(normalizeHeader);

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = String(row[i] ?? '').trim();
      });
      return obj;
    });
}

async function fetchSheetTitle(spreadsheetId) {
  const meta = await fetchSheetMeta(spreadsheetId);
  return meta.title;
}

async function fetchSheetTabs(spreadsheetId) {
  const meta = await fetchSheetMeta(spreadsheetId);
  return meta.tabs;
}

async function fetchSheetMeta(spreadsheetId) {
  const auth      = makeAuthClient();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  return {
    title: response.data.properties?.title || spreadsheetId,
    tabs:  (response.data.sheets || []).map((s) => s.properties.title),
  };
}

module.exports = {
  fetchRows,
  fetchSheetTitle,
  fetchSheetTabs,
  fetchSheetMeta,
  listSpreadsheets,
};
