```markdown
# plan-reschedule-simple.md
Simplified Reservation Rescheduling Design  
Stack: **Hono + HTMX + Cloudflare Workers + Supabase(PostgreSQL)**

---

# 1. Purpose

This document defines a **simplified and stable design** for implementing:

- Booking chat
- Reservation change proposals

The goal is to **minimize state complexity and prevent slot corruption or double booking**.

Key design principle:

```

Slots are only modified when a reservation is confirmed.

```

Change proposals **do NOT lock slots**.

---

# 2. Core Design Philosophy

Many reservation systems fail because they try to lock slots during negotiation.

Instead:

```

Booking state = source of truth  
Proposal = suggestion only  
Slot availability checked at acceptance time

```

Therefore:

- slot state remains simple
- proposals do not mutate slot data
- booking updates happen atomically

---

# 3. Entities

Main tables:

```

client  
booking  
available_slot  
booking_option  
chat_message  
booking_change_proposal

```

Relationships:

```

Client  
│  
└── Booking  
│  
├── ChatMessage  
│  
└── BookingChangeProposal  
│  
└── AvailableSlot

```

---

# 4. Slot Model

Slots have **only two states**:

```

open  
reserved

````

SQL example:

```sql
available_slot
-------------
id
start_at
end_at
reserved_by_booking
````

Meaning:

|value|meaning|
|---|---|
|NULL|available|
|booking_id|reserved|

No proposal lock.

---

# 5. Booking Change Proposal Table

Stores suggested alternative times.

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

Status values:

```
pending
accepted
rejected
expired
```

---

# 6. Chat System

Chat messages are linked to bookings.

```sql
CREATE TABLE chat_message (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES booking(id),

  sender_type TEXT NOT NULL,
  message TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);
```

sender_type:

```
client
admin
system
```

---

# 7. Change Proposal Workflow

## Step 1 Admin proposes new time

Admin selects a slot.

SQL:

```sql
INSERT INTO booking_change_proposal
(
 booking_id,
 proposed_slot_id,
 status,
 expires_at
)
VALUES
(
 10,
 80,
 'pending',
 now() + interval '8 hours'
);
```

No slot modification occurs.

---

# 8. Client Sees Proposal

Client MyPage queries:

```sql
SELECT *
FROM booking_change_proposal
WHERE booking_id = $1
AND status = 'pending'
```

UI shows:

```
Admin proposes new time

2026-04-20 15:00

Reply within 8 hours
```

---

# 9. Client Accepts Proposal

When client accepts, the system checks slot availability.

Atomic update:

```sql
UPDATE booking
SET slot_id = 80
WHERE id = 10
AND NOT EXISTS (
  SELECT 1
  FROM booking
  WHERE slot_id = 80
);
```

If update succeeds:

```
proposal.status = accepted
old slot becomes free
new slot becomes reserved
```

---

# 10. Client Rejects Proposal

SQL:

```sql
UPDATE booking_change_proposal
SET status = 'rejected',
responded_at = now()
WHERE id = $proposal_id;
```

No slot changes.

---

# 11. Proposal Expiration

Expired proposals are cleaned by scheduled job.

Workers cron example:

```
*/10 * * * *
```

Query:

```sql
UPDATE booking_change_proposal
SET status = 'expired'
WHERE status = 'pending'
AND expires_at < now();
```

No slot operations required.

---

# 12. Slot Integrity Rule

Slots must always satisfy:

```
One slot → at most one booking
```

Constraint example:

```sql
CREATE UNIQUE INDEX unique_slot_booking
ON booking(slot_id)
WHERE status IN ('confirmed','finalized');
```

---

# 13. HTMX UI Design

## Admin Booking Page

Path:

```
/admin/booking/{id}
```

Components:

```
Booking info
Chat
Propose new slot
Proposal status
```

---

### Slot search

```html
<form hx-get="/admin/api/slot-search"
      hx-target="#slot-results">
```

---

### Proposal button

```html
<button
 hx-post="/admin/api/propose-change"
 hx-vals='{"slot_id":123}'>
Propose
</button>
```

---

# 14. Client MyPage

URL:

```
/mypage?token=xxxxx
```

Sections:

```
Booking info
Chat
Change proposal
Option selection
```

---

### Accept / Reject

```html
<button hx-post="/api/change/accept">
Accept
</button>

<button hx-post="/api/change/reject">
Reject
</button>
```

---

# 15. Chat UI

Auto refresh:

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

# 16. Benefits of Simplified Design

Advantages:

```
No slot locking
No cron slot recovery
Minimal state complexity
Lower bug risk
Cleaner SQL logic
```

Slot state space becomes:

```
open
reserved
```

Instead of:

```
open
reserved
proposal_locked
expired
released
```

---

# 17. Failure Handling

If client accepts but slot already taken:

System returns:

```
This slot is no longer available.
Please select another time.
```

Admin can propose again.

---

# 18. Final Architecture

```
Browser
   ↓
HTMX
   ↓
Hono (Cloudflare Workers)
   ↓
Supabase Postgres
```

System responsibilities:

```
Booking = source of truth
Proposal = negotiation metadata
Slots = simple availability model
Chat = communication layer
```

---

# 19. Summary

This simplified model ensures:

```
Stable booking logic
Minimal slot corruption risk
Simple SQL operations
Clean HTMX UI workflow
```

The system supports:

```
Booking
Chat
Rescheduling negotiation
Expiration handling
```

while maintaining **database integrity and manageable code complexity**.