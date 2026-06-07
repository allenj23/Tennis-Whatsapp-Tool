/**
 * Customer-facing Google OAuth integration (vendor-owned Cloud project).
 * Routes are mounted separately from routes.js to avoid circular imports.
 */

const oauth  = require('./oauth');
const sheets = require('./sheets');
const config = require('./config');

module.exports = {
  isConnected:        oauth.isConnected,
  isVendorConfigured: config.isVendorConfigured,
  getStatus:          oauth.getStatus,
  disconnect:         oauth.disconnect,
  fetchRows:          sheets.fetchRows,
  fetchSheetTabs:     sheets.fetchSheetTabs,
  fetchSheetTitle:    sheets.fetchSheetTitle,
};
