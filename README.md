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

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `npm start` gives a policy error | PowerShell script execution policy | Use `npm.cmd start` instead |
| `EADDRINUSE: address already in use` | Old server still running on port 3000 | Kill the process (see Stopping section) |
| QR code never appears | Puppeteer/Chromium failed to launch | Check Node.js version; try `npm install` again |
| "WhatsApp disconnected" in UI | Phone went offline or session timed out | Reload the page to reconnect |
| Phone numbers show as "Failed" | Wrong country code or number format | Check that numbers include country code, or use local format (e.g. `05x`) — default country is Israel (+972) |
| Excel file shows 0 contacts | Wrong column headers | File must have columns named exactly `Name`, `Phone`, `Group` |

---

## Notes

- The app is **single-user** and runs locally — no authentication is required.
- Uploaded contacts are stored **in memory only**. They are lost when the server restarts. Re-upload after each restart.
- Messages are sent with a 2–5 second randomized delay between recipients to reduce WhatsApp spam detection risk.
- `Sent` status means WhatsApp accepted the message, not that it was read.
