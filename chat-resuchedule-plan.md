```markdown
# plan-chat-and-reschedule.md
Chat System and Reservation Rescheduling Specification  
Stack: **Hono + HTMX + Cloudflare Workers + Supabase(PostgreSQL)**

---

# 1. Overview

This document defines the backend and UI design for two additional features:

1. **Client ↔ Admin chat linked to each booking**
2. **Reservation time change proposal system**

These features allow administrators to communicate with clients and negotiate reservation changes safely.

Design goals:

- keep booking integrity
- prevent slot conflicts
- support negotiation workflow
- simple UI with HTMX
- minimal JavaScript

---

# 2. Core Concepts

Reservation negotiation workflow:

```

Booking  
│  
├── ChatMessage  
│  
└── BookingChangeProposal  
│  
└── AvailableSlot

```

A **Booking** becomes the conversation and negotiation hub.

---

# 3. Database Schema

## 3.1 Chat Message Table

Stores conversation messages between client and admin.

```

chat_message

````

Fields:

| column | type | description |
|------|------|-------------|
id | BIGSERIAL PK | message id |
booking_id | BIGINT FK | related booking |
sender_type | TEXT | `client` / `admin` / `system` |
message | TEXT | message body |
created_at | TIMESTAMPTZ | timestamp |

SQL:

```sql
CREATE TABLE chat_message (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES booking(id),
  sender_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
````

---

## 3.2 Booking Change Proposal

Stores proposed new reservation slots.

```
booking_change_proposal
```

Fields:

|column|type|description|
|---|---|---|
|id|BIGSERIAL PK||
|booking_id|BIGINT FK||
|proposed_slot_id|BIGINT FK||
|status|TEXT||
|expires_at|TIMESTAMPTZ||
|created_at|TIMESTAMPTZ||
|responded_at|TIMESTAMPTZ||

Status values:

```
pending
accepted
rejected
expired
```

SQL:

```sql
CREATE TABLE booking_change_proposal (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES booking(id),
  proposed_slot_id BIGINT REFERENCES available_slot(id),
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);
```

---

## 3.3 Slot Lock for Proposal

When a new time is proposed, that slot must be temporarily locked.

Add field to `available_slot`:

```sql
ALTER TABLE available_slot
ADD COLUMN reserved_by_proposal BIGINT;
```

Meaning:

|value|meaning|
|---|---|
|NULL|slot available|
|proposal_id|temporarily locked|
|booking_id|confirmed reservation|

---

# 4. Chat System

## 4.1 Chat Flow

```
client sends message
admin replies
messages stored in chat_message
```

System messages are also stored:

```
system:
Reservation change proposed
```

---

## 4.2 API Endpoints

### Get messages

```
GET /api/chat?booking_id=
```

Returns chat history.

---

### Send message

```
POST /api/chat/send
```

Payload:

```
booking_id
sender_type
message
```

---

# 5. Reservation Change Proposal

## 5.1 Admin proposes new slot

Flow:

```
Admin selects new slot
↓
Create proposal
↓
Lock slot
↓
Notify client
```

SQL operation:

```
INSERT booking_change_proposal
UPDATE available_slot SET reserved_by_proposal = proposal_id
```

---

## 5.2 Client response

Client options:

```
Accept
Reject
```

---

### Accept

```
booking.slot_id = new_slot
proposal.status = accepted
old_slot = open
new_slot = reserved
```

---

### Reject

```
proposal.status = rejected
slot unlocked
```

---

# 6. Proposal Expiration

When proposal expires:

```
status = expired
slot unlocked
booking status = cancelled
```

Expiration handled via **scheduled worker task**.

Example cron:

```
*/10 * * * *
```

Query:

```
WHERE expires_at < now()
AND status = 'pending'
```

---

# 7. UI Design

## 7.1 Admin Booking Detail Page

Path:

```
/admin/booking/{id}
```

Components:

```
Booking Information
Chat Window
Slot Search
Change Proposal
Proposal Status
```

---

### Slot Search

HTMX:

```html
<form hx-get="/admin/api/slot-search"
      hx-target="#slot-results">
```

Slot list example:

```
2026-04-20 13:00   [Propose]
2026-04-20 15:00   [Propose]
2026-04-21 11:00   [Propose]
```

---

### Proposal Button

```html
<button
 hx-post="/admin/api/propose-change"
 hx-vals='{"slot_id":123}'>
Propose
</button>
```

Admin also sets expiration deadline.

---

## 7.2 Client MyPage

Path:

```
/mypage?token=xxxxx
```

Sections:

```
Reservation Information
Chat
Change Proposal Response
```

---

### Proposal Notification

If proposal exists:

```
Admin proposes a new session time.

Proposed Time
2026-04-20 15:00

Reply deadline
2026-04-18
```

---

### Client Decision

Buttons:

```
Accept
Reject
```

HTMX:

```html
<button hx-post="/api/change/accept">
Accept
</button>

<button hx-post="/api/change/reject">
Reject
</button>
```

---

# 8. Chat UI (HTMX)

Chat auto refresh:

```html
<div
 hx-get="/api/chat?booking_id=123"
 hx-trigger="load, every 5s"
 hx-target="#chatbox">
</div>
```

Send message:

```html
<form hx-post="/api/chat/send">
<textarea name="message"></textarea>
<button>Send</button>
</form>
```

---

# 9. Slot Integrity

Rules:

1. confirmed booking locks slot
    
2. proposal temporarily locks slot
    
3. expired proposal unlocks slot
    
4. accepted proposal updates booking
    

This prevents double booking.

---

# 10. Admin UX

Admin page shows:

```
Booking
Chat
Proposed time
Proposal status
```

Example status display:

```
Pending
Accepted
Rejected
Expired
```

---

# 11. Client UX

Client MyPage shows:

```
Current booking
Chat messages
Proposal response buttons
```

---

# 12. Security

Security measures:

```
Magic link authentication
HTTPS required
Token validation
Admin endpoints protected
```

Chat messages tied to booking token.

---

# 13. Future Improvements

Potential upgrades:

```
real-time WebSocket chat
multiple proposals
calendar UI
notification emails
automatic reminders
```

---

# 14. Summary

The system now supports:

```
Booking
Chat
Negotiation
Rescheduling
Slot locking
Expiration handling
```

Architecture remains simple and compatible with:

```
Hono
HTMX
Cloudflare Workers
Supabase
```