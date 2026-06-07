module.exports = {
  PORT: process.env.PORT || 3000,
  DEFAULT_COUNTRY_CODE: '972', // Israel (+972)

  // ── Google Sheets sync ──────────────────────────────────────────────────────
  // Leave both empty to disable Google Sheets sync (manual Excel upload still works).
  // SHEETS_SPREADSHEET_ID : the ID from the Sheet URL
  //   https://docs.google.com/spreadsheets/d/<ID>/edit
  // SHEETS_CREDENTIALS_FILE : path to the service-account JSON key file
  //   (relative to the project root, or absolute)
  //   git-ignored — never commit the key file.
  SHEETS_SPREADSHEET_ID:   process.env.SHEETS_SPREADSHEET_ID   || '1RMsActr_byLwQFi0OMRejAoUjszs4THBlO0MVc5d6jE',
  SHEETS_CREDENTIALS_FILE: process.env.SHEETS_CREDENTIALS_FILE || 'whatsapp-tools-498709-c7388e8176ac.json',

  // Name of the worksheet tab to read (leave blank for the first sheet).
  SHEETS_TAB_NAME: process.env.SHEETS_TAB_NAME || '',

  // How often (ms) to poll for changes. Default: 60 seconds.
  SHEETS_POLL_INTERVAL_MS: Number(process.env.SHEETS_POLL_INTERVAL_MS) || 60_000,
};
