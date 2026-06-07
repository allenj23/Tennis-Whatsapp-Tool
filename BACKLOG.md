# Backlog

Items listed here are planned for future phases. Nothing in this file is implemented in Phase 1.

---

## High Priority

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
