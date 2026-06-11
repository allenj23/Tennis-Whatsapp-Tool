/**
 * In-memory OAuth CSRF state + PKCE verifier (single local server process).
 */

let _pending = null;

const MAX_AGE_MS = 10 * 60 * 1000;

function setPending({ state, codeVerifier }) {
  _pending = { state, codeVerifier, createdAt: Date.now() };
}

function consume(state) {
  if (!_pending || _pending.state !== state) return null;
  if (Date.now() - _pending.createdAt > MAX_AGE_MS) {
    _pending = null;
    return null;
  }
  const verifier = _pending.codeVerifier;
  _pending = null;
  return verifier;
}

function clear() {
  _pending = null;
}

module.exports = { setPending, consume, clear };
