/**
 * Google Sheets/Drive reads via user OAuth.
 * Same row shape as src/sheets.js for buildContacts compatibility.
 */

const { google } = require('googleapis');
const oauth      = require('./oauth');

function normalizeHeader(h) {
  return String(h ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u00a0\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listSpreadsheets() {
  const auth  = await oauth.getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    q:        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields:   'files(id, name, modifiedTime)',
    orderBy:  'modifiedTime desc',
    pageSize: 50,
  });

  return (res.data.files || []).map((f) => ({
    id:           f.id,
    name:         f.name,
    modifiedTime: f.modifiedTime,
  }));
}

async function fetchSheetTabs(spreadsheetId) {
  const auth   = await oauth.getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });

  return {
    title: res.data.properties?.title || spreadsheetId,
    tabs:  (res.data.sheets || []).map((s) => s.properties.title),
  };
}

async function fetchSheetTitle(spreadsheetId) {
  const meta = await fetchSheetTabs(spreadsheetId);
  return meta.title;
}

async function fetchRows(spreadsheetId, tabName) {
  const auth   = await oauth.getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = tabName ? `'${tabName.replace(/'/g, "''")}'` : 'A:ZZZ';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const values = res.data.values || [];
  if (values.length === 0) return [];

  const [headerRow, ...dataRows] = values;
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

module.exports = {
  listSpreadsheets,
  fetchSheetTabs,
  fetchSheetTitle,
  fetchRows,
};
