# Backlog

Items listed here are planned for future phases. Nothing in this file is implemented in Phase 1.

---

## High Priority

### Live Google Sheets Synchronization

**Goal:** Google Sheets becomes the system of record for all contacts and groups, replacing manual Excel uploads entirely.

**Current situation:** Office staff must manually export and upload an Excel file each time the contact list changes.

**Desired state:** The application stays continuously synchronized with a Google Sheet maintained by office staff. Changes made in the sheet become available in the application automatically — no exports, no uploads.

#### Functional requirements

- Connect to a configured Google Sheet (identified by sheet URL or ID).
- On startup, load the full contact list from the connected sheet into memory.
- Periodically check whether the sheet has changed.
- When a change is detected, refresh the in-memory contact list and groups automatically.
- Display sync status in the UI:
  - Connected sheet name / URL
  - Last successful sync time
  - Current sync status (Connected · Syncing · Error)

#### Synchronization requirements

- Polling interval should be configurable (e.g. every 60 seconds by default).
- If the sheet is unreachable, the application should continue using the last successfully cached data and surface a warning.
- Staff should never need to take a manual action for routine contact-list updates.

#### User experience

The UI header or a dedicated status bar should show:
- Sheet name and connection status
- Time of last successful sync
- A visual indicator when a sync is in progress or has failed

#### Future investigation required

Before implementation, evaluate and choose between:

1. **Polling-based synchronization** — periodically fetch the sheet on a timer. Simple to implement; slight delay between edit and refresh. No Google Cloud project required if using published sheet CSV export.
2. **Google Drive change notifications (push webhooks)** — Google Drive API sends a POST to a registered endpoint when the file changes. Near real-time; requires a publicly reachable server URL and Google Cloud credentials.
3. **Google Sheets API `updatedTime` detection** — poll the Sheets/Drive API for the file's last-modified timestamp; only re-fetch cell data when the timestamp has advanced. Efficient; requires OAuth or API key setup.

The preferred solution should minimize manual actions by office staff and avoid requiring a public server endpoint if the tool remains local-only.

---

### Message Templates

Pre-defined message templates for common club communications so staff can select a template and fill in variables rather than composing from scratch each time.

Template ideas:
- **Welcome message** — sent to new members joining the club.
- **Competition reminder** — upcoming match or tournament details.
- **Training cancellation** — notify players that a session is cancelled.
- **Holiday announcements** — club closure or holiday schedule updates.

---

## Medium Priority

### Persist Uploaded Excel File

- Save the uploaded Excel file to local disk on the server.
- Automatically reload the most recently saved Excel file when the application starts, so staff do not need to re-upload after a restart.

### Default Country Code Setting

- The application must use a default country code when a phone number in the Excel file has no country prefix.
- System default: **Israel (+972)**.
- Allow the default country code to be changed via a configuration file or settings screen without modifying code.
