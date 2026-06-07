# WhatsApp Campaign Tool — Install guide

For club office staff. No Google Cloud setup required.

## Quick start

1. Run **Install.bat** once (installs dependencies; may take a few minutes on first run).
2. Double-click **Start.bat** every time you use the app.
3. Your browser opens automatically. Follow the on-screen steps:
   - **Step 1** — Scan WhatsApp QR code
   - **Step 2** — Sign in with Google → choose your contacts spreadsheet → pick a tab
   - **Step 3+** — Select recipients and send messages

Keep the black terminal window open while the app is running. Press **Ctrl+C** in that window to stop.

## First WhatsApp connection

The first time you connect WhatsApp, the app downloads a small browser component (~150 MB). This happens once and may take a few minutes.

## Signing out

- **WhatsApp** — "Sign out" on the green connected row in Step 1
- **Google** — "Sign out" in the top-right header next to your email

## Troubleshooting

| Problem | Fix |
|---|---|
| Install.bat says Node not found | Use the full installer from your vendor (includes Node), or install Node.js LTS from [nodejs.org](https://nodejs.org) |
| Browser does not open | Manually open http://127.0.0.1:3000 |
| Google sign-in fails | Contact your vendor — redirect URI must be configured in their Google Cloud project |
| Port already in use | Close any other copy of the app, or restart the computer |

## Data location

Your settings, Google sign-in, and WhatsApp session are stored in the `data` and `.wwebjs_auth` folders next to the app. Do not delete these unless you want to sign in again from scratch.
