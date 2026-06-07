# WhatsApp Campaign Tool — Product Requirements

## Goal

Allow office staff to send WhatsApp messages, flyers, images, and PDFs to selected groups or customers from an Excel file.

## Constraints

- Simple internal tool
- Single user
- No AI
- No scheduling
- No database

---

## Phase 1

### Overview

Connect the tool to WhatsApp Web, load a contact list from an Excel file, select recipients by group or individually, compose a message with optional media, and send it with live delivery status.

### Excel Contact List Format

| Column | Description                        |
|--------|------------------------------------|
| Name   | Display name of the contact        |
| Phone  | Phone number (local or international format) |
| Group  | Label used to filter/group contacts (e.g. "Men's Team", "Members") |

> Note: "Group" is a contact label in the spreadsheet. Messages are always sent to individual phone numbers — WhatsApp group chats are not used.

### Features

- Connect to WhatsApp via WhatsApp Web (QR code scan)
- Upload an Excel file (.xlsx / .xls)
- Display all groups found in the Excel file
- Select one or more groups
- Select individual customers
- Compose a text message with optional image or PDF attachment
- Send to all selected recipients
- Show per-recipient delivery status (Pending → Sent / Failed)

### Out of Scope for Phase 1

- Message scheduling
- Persistent contact storage (database)
- Message templates
- Multiple users / authentication
- WhatsApp group chat messaging
