/**
 * Vendor service account — used for Sheets sync and reading the allow list.
 * Never exposed to end users; credentials stay on disk or in the release build.
 */

const path   = require('path');
const fs     = require('fs');
const { google } = require('googleapis');
const { SHEETS_CREDENTIALS_FILE } = require('../config');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/devstorage.read_only',
];

let _auth = null;

function credentialsPath() {
  const credPath = path.isAbsolute(SHEETS_CREDENTIALS_FILE)
    ? SHEETS_CREDENTIALS_FILE
    : path.resolve(process.cwd(), SHEETS_CREDENTIALS_FILE);

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Service-account key file not found: ${credPath}\n` +
      'Set SHEETS_CREDENTIALS_FILE in src/config.js.'
    );
  }
  return credPath;
}

function isConfigured() {
  try {
    credentialsPath();
    return true;
  } catch {
    return false;
  }
}

function getAuth() {
  if (!_auth) {
    _auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath(),
      scopes: SCOPES,
    });
  }
  return _auth;
}

module.exports = { getAuth, isConfigured, credentialsPath };
