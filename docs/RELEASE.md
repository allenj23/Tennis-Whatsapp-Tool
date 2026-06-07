# Release build (vendor only)

How to produce the Windows installer customers receive. Club managers never run these steps.

## Prerequisites (your machine)

- Node.js LTS installed
- `vendor-google-oauth.json` in the project root (from `vendor-google-oauth.example.json`)
- Google Cloud OAuth client with **both** redirect URIs authorized:
  ```
  http://127.0.0.1:3000/api/google/auth/callback
  http://localhost:3000/api/google/auth/callback
  ```
- (Optional) [Inno Setup 6](https://jrsoftware.org/isinfo.php) — produces `WhatsAppCampaignTool-Setup.exe`

## Build

```powershell
npm run build:release
```

> **Dev note:** `bake-oauth` writes `src/google-auth/baked-credentials.js` (git-ignored). That file takes priority over `vendor-google-oauth.json` until you delete it. Remove it to go back to file-based dev credentials.

This will:

1. **Bake** OAuth client ID + secret into `src/google-auth/baked-credentials.js` (not shipped as loose JSON)
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

## Security notes

- OAuth credentials are **embedded at build time** — customers never see `vendor-google-oauth.json`
- Desktop OAuth client secrets are not truly secret (Google treats installed/loopback apps accordingly); still avoid publishing the secret publicly
- App binds to **127.0.0.1 only** — not reachable from other machines on the network
- Per-install Google refresh tokens are encrypted in `data/google-connection.json`

## Google app verification

Before distributing outside your test users, complete Google's OAuth **app verification** for the external consent screen. Until verified, only accounts you add as test users can sign in.

## Environment overrides (build)

| Variable | Default | Purpose |
|---|---|---|
| `RELEASE_PORT` | `3000` | Port baked into OAuth redirect URI |
| `NODE_RELEASE_VERSION` | `v20.19.2` | Portable Node version to bundle |
| `GOOGLE_OAUTH_CREDENTIALS_FILE` | `vendor-google-oauth.json` | Alternate credentials path |
