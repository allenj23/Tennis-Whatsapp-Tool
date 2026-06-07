# Google OAuth Spike — Experimental POC

**Branch:** `feature/google-oauth-spike`  
**Status:** Experiment only — do not merge to `main`  
**Test page:** http://localhost:3000/oauth-test

This spike validates whether **user OAuth** (Sign in with Google) is a viable alternative to the current **service-account** Google Sheets integration for future customer installations.

Production code (`src/sheets.js`, `src/sync.js`, `src/sources.js`) is **unchanged**. All OAuth logic lives under `src/oauth-spike/`.

---

## What the spike does

1. **Sign in with Google** — standard OAuth 2.0 authorization code flow
2. **List spreadsheets** the signed-in user can access (via Drive API)
3. **Select a spreadsheet and tab**
4. **Read and preview** data — sheet name, row count, first 10 rows

---

## Google Cloud configuration

### 1. Create or reuse a project

Go to [Google Cloud Console](https://console.cloud.google.com).

### 2. Enable APIs

Enable both:

| API | Why |
|---|---|
| **Google Sheets API** | Read cell values |
| **Google Drive API** | List spreadsheets the user owns or has access to |

(Service accounts only needed Sheets API. OAuth listing requires Drive.)

### 3. Configure OAuth consent screen

1. APIs & Services → **OAuth consent screen**
2. User type: **External** (for testing) or **Internal** (Google Workspace only)
3. Add app name, support email
4. Add scopes (see below)
5. Add test users if app is in **Testing** mode (all non-test Google accounts will be blocked until published)

### 4. Create OAuth client credentials

1. APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Authorized redirect URI:

   ```
   http://localhost:3000/oauth-spike/auth/callback
   ```

4. Download the JSON or copy Client ID and Client Secret

### 5. Configure this app

Copy the example file and fill in your values:

```powershell
copy oauth-spike.credentials.example.json oauth-spike.credentials.json
```

Or set environment variables:

```
OAUTH_SPIKE_CLIENT_ID=....apps.googleusercontent.com
OAUTH_SPIKE_CLIENT_SECRET=...
OAUTH_SPIKE_REDIRECT_URI=http://localhost:3000/oauth-spike/auth/callback
```

`oauth-spike.credentials.json` is git-ignored.

### 6. Run

```powershell
npm.cmd start
```

Open http://localhost:3000/oauth-test

---

## Required OAuth scopes

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/spreadsheets.readonly` | Read spreadsheet cell values |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | List spreadsheets (id + name only) |
| `openid` | OpenID Connect |
| `email` | Show signed-in email on test page |

These are the **minimum** scopes for list + read. No write access is requested.

---

## Demonstrating the flow

1. Start the server → open `/oauth-test`
2. Click **Sign in with Google** → complete consent
3. After redirect, the page shows your email
4. Choose a spreadsheet from the dropdown
5. Choose a worksheet tab
6. Click **Load preview** → see sheet name, row count, and first 10 rows in a table
7. Click **Sign out** to clear the spike session

Sessions are stored **in memory** only. Restarting the server requires signing in again.

---

## Limitations of this spike

| Limitation | Detail |
|---|---|
| **In-memory sessions** | Tokens lost on server restart; not suitable for production |
| **No token refresh UI** | Refresh tokens are stored but expiry handling is minimal |
| **No integration with main app** | Does not feed contacts into Step 3 or replace `sync.js` |
| **Localhost redirect only** | Production would need HTTPS redirect URIs per deployment |
| **OAuth consent / verification** | External apps in production may require Google verification for sensitive scopes |
| **Testing mode cap** | Unpublished apps limited to ~100 test users |
| **Per-user access only** | Each staff member signs in with their own Google account; sees only sheets they can access |
| **No unattended sync** | Unlike service accounts, OAuth requires a human sign-in (unless refresh tokens are persisted securely) |

---

## OAuth vs Service Account — comparison

| Criteria | Service Account (current production) | User OAuth (this spike) |
|---|---|---|
| **Setup for club staff** | Developer shares sheet with robot email; staff never sees Google auth | Each user clicks “Sign in with Google” once |
| **Who can access sheets** | Only sheets explicitly shared with the service account | Any sheet the signed-in user already has access to |
| **Unattended background sync** | Yes — polls every 60s without user interaction | Requires stored refresh token + token refresh logic |
| **Multi-user / multi-club SaaS** | Each customer needs their own service account JSON (secret distribution problem) | Each customer signs in with their Google account (better UX for self-serve install) |
| **Security model** | Long-lived key file on disk — high impact if leaked | Short-lived access tokens; user can revoke in Google Account settings |
| **Google Cloud setup** | Service account + share sheet | OAuth client + consent screen (+ verification for public launch) |
| **APIs required** | Sheets API only | Sheets API + Drive API |
| **Listing spreadsheets** | Must know spreadsheet ID upfront | Can browse user’s spreadsheets |
| **Operational complexity** | Low for single club, one shared sheet | Higher (sessions, token refresh, consent screen) |

---

## Recommendation for future productization

### Keep Service Accounts for **single-club, IT-managed deployments**

Best when:

- One organization, one shared contacts sheet
- IT/admin can share the sheet with a service account once
- Background polling must run 24/7 without anyone signed in
- No Google sign-in UX desired for office staff

### Prefer User OAuth for **self-serve customer installations**

Best when:

- Customers install the tool themselves (“one-click install”)
- Each customer uses their own Google Drive / Sheets
- You cannot ask customers to create service accounts and share JSON keys
- Browsing “my spreadsheets” is valuable during setup
- Occasional re-auth after token expiry is acceptable

### Hybrid (likely best long-term product)

1. **Default:** OAuth sign-in during setup wizard → pick spreadsheet → store refresh token encrypted on disk
2. **Advanced / enterprise:** Optional service-account mode for unattended server deployments
3. **Spike proved:** Technical feasibility of OAuth read path; production needs persistent token store, refresh handling, and HTTPS

### Do not replace production yet

This spike confirms UX and API feasibility. Before replacing `src/sheets.js`:

- Persistent encrypted token storage
- Automatic token refresh before polls
- Error UX when consent revoked
- Google app verification (if external users)
- E2E tests with mocked OAuth

---

## File map (isolated code)

```
src/oauth-spike/
  config.js    — credentials + scopes
  session.js   — in-memory session store
  google.js    — OAuth2 + Drive/Sheets API calls
  router.js    — /oauth-test and /oauth-spike/* routes

public/oauth-test.html   — spike UI

docs/OAUTH_SPIKE.md      — this document
oauth-spike.credentials.example.json
```

**Single touch point in production wiring:** `src/server.js` mounts the spike router. Remove that one line to disable the experiment on any branch.
