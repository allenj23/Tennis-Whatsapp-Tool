# WhatsApp Campaign Tool

Internal tool for tennis club office staff to send WhatsApp messages, images, and PDFs to selected contacts from an Excel file.

## Documentation

| Document | Contents |
|---|---|
| [PROJECT.md](PROJECT.md) | Product requirements, features, and scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical design, tech stack, folder structure, milestones, risks |
| [BACKLOG.md](BACKLOG.md) | Planned future features (not yet implemented) |

---

## Prerequisites

- **Node.js** LTS (v18 or v20 recommended) — [nodejs.org](https://nodejs.org)
- npm (included with Node.js)

On first install, `whatsapp-web.js` downloads a Chromium browser automatically (~150 MB). This takes a few minutes and only happens once.

---

## First-time setup

```
npm install
```

---

## Starting the app

**On Windows PowerShell** (use `npm.cmd` if plain `npm` gives a policy error):

```
npm.cmd start
```

**On Mac / Linux / Git Bash:**

```
npm start
```

You should see:

```
WhatsApp client initializing...
WhatsApp Campaign Tool running at http://localhost:3000
```

Open **http://localhost:3000** in your browser. The terminal must stay open while the app is running — do not close it.

---

## How to use

1. **Connect to WhatsApp** — scan the QR code with your phone (WhatsApp → Linked Devices → Link a device).
2. **Upload contact list** — select an Excel file (`.xlsx` or `.xls`) with columns `Name | Phone | Group`.
3. **Select recipients** — check groups or individual contacts.
4. **Compose** — type a message and optionally attach an image or PDF.
5. **Send** — watch live per-recipient status. Failed recipients can be retried.

---

## Stopping the app

Press **Ctrl+C** in the terminal where `npm.cmd start` is running.

If the terminal is gone but the server is still running (site still loads), kill it from PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Restarting after code changes

1. Stop the server (Ctrl+C or kill port 3000 as above)
2. Run `npm.cmd start` again
3. Refresh the browser (F5)

---

## Resetting the WhatsApp session

If you need to scan the QR code again (e.g. phone changed, session expired):

1. Stop the server
2. Delete the session folder:

```powershell
Remove-Item -Recurse -Force .wwebjs_auth
```

3. Start again — a fresh QR code will appear

---

## Google Sheets sync (optional)

When configured, the app automatically loads contacts from a Google Sheet and refreshes them every 60 seconds — no Excel uploads needed.

### One-time setup

| Step | What to do |
|---|---|
| 1. Google Cloud project | Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project → enable **Google Sheets API** |
| 2. Service account | IAM & Admin → Service Accounts → Create → generate a JSON key → download it into the project folder |
| 3. Share the sheet | Open your Google Sheet → Share → add the service-account email (ends in `.iam.gserviceaccount.com`) as **Viewer** |
| 4. Configure | Edit `src/config.js` — set `SHEETS_SPREADSHEET_ID` (the ID from the sheet URL) and `SHEETS_CREDENTIALS_FILE` (the key filename) |
| 5. Restart | `npm.cmd start` — the sync panel appears in Step 2 automatically |

The sheet must have header columns `Name`, `Phone`, `Group` (same format as the Excel upload).

### What happens at runtime

- **On startup**: the last saved contact list is loaded instantly from `data/contacts-cache.json`. The live poll runs in parallel.
- **Every 60 seconds**: the app fetches the sheet. If it changed, contacts refresh automatically and any active recipient selection is reconciled (removed contacts are deselected).
- **On failure**: the last-good contact list stays in memory. The status badge turns red with the error message. The app retries with exponential backoff (up to 10 minutes between retries).
- **Manual sync**: click the **Sync from Google Sheets** button in Step 2 to force an immediate refresh.
- **Excel upload**: still available as a fallback at any time.

### Changing the poll interval

Edit `src/config.js`:

```js
SHEETS_POLL_INTERVAL_MS: 30_000,   // 30 seconds
```

Or set the environment variable `SHEETS_POLL_INTERVAL_MS` before starting.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `npm start` gives a policy error | PowerShell script execution policy | Use `npm.cmd start` instead |
| `EADDRINUSE: address already in use` | Old server still running on port 3000 | Kill the process (see Stopping section) |
| QR code never appears | Puppeteer/Chromium failed to launch | Check Node.js version; try `npm install` again |
| "WhatsApp disconnected" in UI | Phone went offline or session timed out | Reload the page to reconnect |
| Phone numbers show as "Failed" | Wrong country code or number format | Check that numbers include country code, or use local format (e.g. `05x`) — default country is Israel (+972) |
| Excel file shows 0 contacts | Wrong column headers | File must have columns named exactly `Name`, `Phone`, `Group` |
| Sync badge shows "Error: insufficient scopes" | Drive API scope missing | Enable only the Sheets API (Drive API not needed) |
| Sync badge shows "Error: not found" | Sheet not shared with service account | Open the sheet → Share → add the service-account email as Viewer |
| Sync badge shows "Error: key file not found" | Wrong path in `SHEETS_CREDENTIALS_FILE` | Check the filename matches the JSON key file in the project folder |
| Contacts not updating after sheet edit | Cache served until next poll | Click "Sync from Google Sheets" for an immediate refresh |

---

## Notes

- The app is **single-user** and runs locally — no authentication is required.
- When Google Sheets sync is active, contacts survive restarts via `data/contacts-cache.json`. Without sync, re-upload the Excel file after each restart.
- Messages are sent with a 2–5 second randomized delay between recipients to reduce WhatsApp spam detection risk.
- `Sent` status means WhatsApp accepted the message, not that it was read.
