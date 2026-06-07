# Google OAuth Product Rollout

**Branch:** `feature/google-oauth-spike` (evolving into product OAuth path)  
**Goal:** Customer installs EXE → Sign in with Google → Pick sheet → Done

---

## Customer experience (target)

1. Install EXE
2. Connect WhatsApp (QR)
3. **Sign in with Google**
4. **Select spreadsheet + tab**
5. Contacts sync automatically — use the app

No Google Cloud, service accounts, or JSON files for the customer.

---

## Phases

### Phase 1 — Foundation ✅ (this branch)

- [x] `src/google-auth/` production module
- [x] Encrypted token persistence (`data/google-connection.json`)
- [x] Automatic token refresh before API calls
- [x] Sync wired to OAuth when connected
- [x] Step 2 UI: Sign in → pick sheet → sync
- [ ] **You verify:** copy `vendor-google-oauth.example.json` → `oauth-spike.credentials.json` or `vendor-google-oauth.json`, add redirect URI in Google Cloud, restart, test flow

### Phase 2 — Polish onboarding ✅

- [x] First-run wizard in Step 2 (Sign in → Choose sheet → Sync)
- [x] Hide legacy “paste URL”, multi-source list, and Excel upload when OAuth is active
- [x] “Reconnect Google” banner when sync/API reports auth failure
- [x] Google account badge in header when signed in

### Phase 3 — EXE packaging ✅

- [x] `npm run bake-oauth` — embed vendor credentials at build time (no loose JSON for customers)
- [x] `npm run build:release` — portable Node + production deps + `dist/WhatsApp-Campaign-Tool/`
- [x] `installer/WhatsAppCampaignTool.iss` — Inno Setup → `WhatsAppCampaignTool-Setup.exe`
- [x] Customer `Install.bat` / `Start.bat` + `README-INSTALL.md`
- [x] Server binds `127.0.0.1`; OAuth redirect `http://127.0.0.1:3000/api/google/auth/callback`
- [ ] **You verify:** run `npm run build:release`, test `dist\...\Start.bat`, ship Setup.exe
- [ ] Google app verification before wide external rollout

### Phase 4 — Retire customer-facing service account

- Remove service-account setup from customer README
- Keep service-account code only for internal/vendor dev if needed

---

## Vendor setup (once, not per club)

1. One Google Cloud project (yours)
2. Enable **Google Sheets API** + **Google Drive API**
3. OAuth consent screen (External → verify before wide release)
4. OAuth **Web application** client
5. Redirect URIs (add **both** in Google Cloud):
   - `http://127.0.0.1:3000/api/google/auth/callback` (release / customer EXE)
   - `http://localhost:3000/api/google/auth/callback` (local dev)
6. Credentials file on dev machine: `vendor-google-oauth.json` (git-ignored)
7. In EXE build: ship client ID; protect client secret per platform guidance

---

## What to test now

1. Ensure `oauth-spike.credentials.json` or `vendor-google-oauth.json` exists with valid OAuth **Web** client credentials
2. Update Google Cloud redirect URI to:
   ```
   http://localhost:3000/api/google/auth/callback
   ```
3. `npm.cmd start`
4. Connect WhatsApp → Step 2
5. Sign in with Google → pick sheet → **Use this sheet**
6. Confirm Step 3 shows contacts from Hebrew sheet

---

## Files

| Path | Role |
|---|---|
| `src/google-auth/` | Production OAuth module |
| `data/google-connection.json` | Encrypted refresh token (per install) |
| `vendor-google-oauth.json` | Vendor credentials (dev / build input) |
| `scripts/bake-oauth.js` | Build-time credential embedding |
| `scripts/build-release.ps1` | Windows release + optional Setup.exe |
| `installer/WhatsAppCampaignTool.iss` | Inno Setup script |
| `docs/RELEASE.md` | Vendor build instructions |
| `src/sheets.js` | Unchanged — legacy service-account path |
| `src/oauth-spike/` | Deprecated — remove after Phase 1 verified |
