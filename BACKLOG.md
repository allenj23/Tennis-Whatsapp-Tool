# Backlog

Items listed here are planned for future phases.

---

## ✅ Completed

### Live Google Sheets Synchronization
Fully implemented (Phases 1–3). Scheduled polling, disk cache, sync-status UI, manual sync button, selection reconciliation on refresh. See `src/sync.js`, `src/sheets.js`, `src/cache.js`.

---

## High Priority

### Multi-Sheet Source Selector

**Goal:** Staff can manage a list of saved Google Sheets directly in the app and switch between them with one click — no config file editing.

**Use cases:**
- Switch between the 2026 active members sheet and a 2025 archive sheet for seasonal campaigns.
- Load a specific tab (e.g. "Kids", "Adults") within one spreadsheet as a separate source.
- Merge all tabs from a spreadsheet into one contact list for a club-wide announcement (future).

#### Functional requirements

- A **Sources panel** in Step 2 (above the sync status) shows a list of up to ~5 saved sheets.
- Each source has:  a friendly name, a spreadsheet URL/ID, and an optional tab name.
- **Activate**: clicking a source switches the polling target and triggers an immediate full sync.
- **Add**: paste a Google Sheet URL + give it a name → added to the list and activated.
- **Remove**: each row has a ✕ button. The active source cannot be removed.
- **Tab picker**: each source row shows the selected tab. A dropdown (lazy-loaded from the Sheets API) lets staff pick any tab in that spreadsheet.
- Only the active source is polled at any time.
- Sources list is persisted to `data/settings.json` so it survives restarts.

#### Future: tab merging
When `tabName = "__all__"`, fetch and merge rows from every tab in the spreadsheet into one contact list. Reserved sentinel — not in scope for initial implementation.

#### Implementation steps
1. `src/sources.js` — CRUD for the saved-sources list; persists to `data/settings.json`; migrates from `config.js` defaults on first run.
2. Refactor `src/sheets.js` — `fetchRows(id, tab)`, `fetchSheetTitle(id)`, `fetchSheetTabs(id)` accept IDs as parameters.
3. Update `src/sync.js` — reads active source from `sources.getActive()`; adds `switchSource(index)`.
4. New server routes: `GET/POST /api/sources`, `DELETE /api/sources/:i`, `POST /api/sources/:i/activate`, `PATCH /api/sources/:i`, `GET /api/sources/:i/tabs`.
5. Sources panel UI.
6. Tab dropdown per source row (lazy-loaded).

---

### Message Templates

Pre-defined message templates for common club communications.

- **Welcome message** — sent to new members joining the club.
- **Competition reminder** — upcoming match or tournament details.
- **Training cancellation** — notify players that a session is cancelled.
- **Holiday announcements** — club closure or holiday schedule updates.

---

## Medium Priority

### Default Country Code Setting

- System default: **Israel (+972)**.
- Allow changing via a settings screen without editing code.

---

## Low Priority / Future

### Merged View: Tab Name as Group

When using "All tabs (merged)", optionally treat each tab's name as the contact's Group instead of using the Group column. This allows selecting "Kids" or "Adults" as separate groups in the merged contact list while still being able to message everyone at once.

Currently the first tab's Group column value is used (first-occurrence wins). This backlog item would add a toggle in the sources panel: "Use tab names as groups".

---

### Persist Uploaded Excel File

Save the uploaded Excel file to disk and auto-reload on restart (mostly superseded by Google Sheets sync cache, but useful as a pure-Excel fallback).
