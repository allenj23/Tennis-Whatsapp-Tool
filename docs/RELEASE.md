# Release build (vendor only)

How to produce the Windows installer customers receive. Club managers never run these steps.

## Prerequisites (your machine)

- Node.js LTS installed
- `vendor-google-oauth.json` in the project root (from `vendor-google-oauth.example.json`)
- Service account JSON key (`SHEETS_CREDENTIALS_FILE`) — shared with club spreadsheets, **never shipped to customers** (embed at build or deploy separately per your process)
- GCS allow list JSON uploaded (see `gcs-allowed-users.example.json`) — service account needs `storage.objects.get` on that object
- Google Cloud APIs enabled: **Sheets**, **Drive**, **Cloud Storage**
- Google Cloud OAuth client with **both** redirect URIs authorized:
  ```
  http://127.0.0.1:3000/api/google/auth/callback
  http://localhost:3000/api/google/auth/callback
  ```
- (Optional) [Inno Setup 6](https://jrsoftware.org/isinfo.php) — produces `WhatsAppCampaignTool-Setup.exe`

## Build

```powershell
$env:ALLOWLIST_GCS_URI = "gs://your-bucket/config/allowed-users.json"
# Optional: lock sign-in to one Workspace domain
# $env:GOOGLE_HOSTED_DOMAIN = "yourclub.com"
npm run build:release
```

> **Dev note:** `bake-oauth` writes `src/google-auth/baked-credentials.js` (git-ignored). That file takes priority over `vendor-google-oauth.json` until you delete it. Remove it to go back to file-based dev credentials.

This will:

1. **Bake** OAuth client ID + secret + SSO config (`authMode`, `allowlistGcsUri`, optional `hostedDomain`) into `src/google-auth/baked-credentials.js` (not shipped as loose JSON)
2. Copy the app to `dist/WhatsApp-Campaign-Tool/`
3. **Bundle** portable Node.js 20 into `runtime/node/` (customers do not need Node installed)
4. Run `npm ci --omit=dev` inside the release folder
5. Compile `dist/WhatsAppCampaignTool-Setup.exe` if Inno Setup is installed

## Test before shipping

```powershell
cd dist\WhatsApp-Campaign-Tool
.\Start.bat
```

Verify: WhatsApp QR → Google sign-in → spreadsheet → tab switch → sync.

## What customers get

| Deliverable | Description |
|---|---|
| `WhatsAppCampaignTool-Setup.exe` | Windows installer (recommended) |
| `dist/WhatsApp-Campaign-Tool/` | Portable folder (zip alternative) |

Customer flow: Install → **Start.bat** → browser opens at `http://127.0.0.1:3000`.

See [README-INSTALL.md](../README-INSTALL.md) (included in the release).

## Security notes (SSO mode)

- **Identity:** Google sign-in with PKCE + OAuth `state`; email checked against GCS allow list on login **and** on each API request
- **Data:** Sheets read via hidden service account; customers never see SA credentials
- **Sheets access:** Users may only select spreadsheets shared with the service account (IDs validated server-side)
- **Sessions:** SSO sessions expire after 24h (override with `SESSION_MAX_AGE_MS`)
- **Socket.IO:** Contact data and send progress only emit to authenticated sockets in SSO mode
- **Contacts cache:** Encrypted at rest in `data/contacts-cache.json`
- OAuth credentials are **embedded at build time** — customers never see `vendor-google-oauth.json`
- `authMode=sso` is **locked** in release builds — customers cannot bypass allow list via env vars
- App binds to **127.0.0.1 only** — not reachable from other machines on the network

### GCS allow list format

```json
{ "emails": ["staff1@yourclub.com", "staff2@yourclub.com"] }
```

Share each club spreadsheet with the service account email. All allow-listed users can pick any of those sheets.

## Google app verification

Before distributing outside your test users, complete Google's OAuth **app verification** for the external consent screen. Until verified, only accounts you add as test users can sign in.

## Environment overrides (build)

| Variable | Default | Purpose |
|---|---|---|
| `RELEASE_PORT` | `3000` | Port baked into OAuth redirect URI |
| `ALLOWLIST_GCS_URI` | *(required)* | `gs://bucket/path/allowed-users.json` baked into release |
| `GOOGLE_HOSTED_DOMAIN` | *(empty)* | Optional Workspace domain lock, e.g. `yourclub.com` |
| `NODE_RELEASE_VERSION` | `v20.19.2` | Portable Node version to bundle |
| `GOOGLE_OAUTH_CREDENTIALS_FILE` | `vendor-google-oauth.json` | Alternate credentials path |
| `SESSION_MAX_AGE_MS` | `86400000` (24h) | SSO session lifetime |
