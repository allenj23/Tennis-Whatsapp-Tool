/**
 * Socket.IO authorization aligned with SSO requireAppAuth.
 */

const config = require('./config');
const oauth  = require('./oauth');

async function authorizeSocket(socket) {
  if (!config.isSsoMode() || !config.isVendorConfigured()) {
    socket.join('authenticated');
    return { authorized: true, revoked: false, needsSignIn: false };
  }

  if (!oauth.isConnected()) {
    return { authorized: false, revoked: false, needsSignIn: true };
  }

  try {
    const allowed = await oauth.verifySsoSession();
    if (!allowed) {
      oauth.disconnect();
      return { authorized: false, revoked: true, needsSignIn: true };
    }
    socket.join('authenticated');
    return { authorized: true, revoked: false, needsSignIn: false };
  } catch (err) {
    console.warn('[google-auth] socket allowlist check:', err.message);
    return { authorized: false, revoked: false, needsSignIn: true };
  }
}

function broadcastTarget(io) {
  if (config.isSsoMode() && config.isVendorConfigured() && typeof io?.to === 'function') {
    return io.to('authenticated');
  }
  return io;
}

module.exports = { authorizeSocket, broadcastTarget };
