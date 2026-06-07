# WhatsApp Campaign Tool

Internal tool for tennis club office staff to send WhatsApp messages, images, and PDFs to selected contacts from an Excel file.

## Documentation

| Document | Contents |
|---|---|
| [PROJECT.md](PROJECT.md) | Product requirements, features, and scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical design, tech stack, folder structure, implementation milestones, risks |
| [BACKLOG.md](BACKLOG.md) | Planned future features (not yet implemented) |

## Quick Start

**Prerequisites:** Node.js LTS (18 or 20), npm.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> Note: `whatsapp-web.js` uses Puppeteer and will download a Chromium browser on first install.
> The `xlsx` package has known low-risk advisories (prototype pollution / ReDoS) with no upstream fix available; safe for internal use with trusted files.
