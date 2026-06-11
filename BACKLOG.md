# Backlog

Items listed here are planned for future phases and have not yet been implemented.

---

## High Priority

### Message Templates

Pre-defined message templates for common club communications so staff can select a template and fill in variables rather than composing from scratch each time.

Template ideas:
- **Welcome message** — sent to new members joining the club.
- **Competition reminder** — upcoming match or tournament details.
- **Training cancellation** — notify players that a session is cancelled.
- **Holiday announcements** — club closure or holiday schedule updates.

### Family-Aware Delivery Strategies

Support campaign delivery modes that avoid duplicate family responses when multiple contacts in the sheet belong to the same household (e.g. shared parent phone across siblings, or mom + dad on the same enrollment).

Use cases:
- **End-of-year surveys** — one response per family, not per child row.
- **Parent feedback forms** — send once to the household contact.
- **Registration forms** — avoid multiple form links to the same phone.

Delivery modes could include:
- **Per enrollment** (current) — one message per selected row/phone.
- **Per phone** — dedupe at send time (partially supported today).
- **Per family** — group rows by household key (shared phone, family ID, or surname + phone) and deliver once per family unit.

Requires UI to choose delivery mode per campaign and clear counts (e.g. enrollments selected vs. families receiving).
