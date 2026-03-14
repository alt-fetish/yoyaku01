```markdown
# plan-backend.md
Counseling Session Reservation Backend Design

## 1. Overview

This backend manages a **two-step reservation workflow** for counseling sessions.

Characteristics:

- Single counselor
- One session per slot
- Session duration: **2 hours**
- Cleaning buffer: **1 hour before and after**
- Morning first slot: **no pre-buffer**
- Reservation status progression:
  
```

pending → confirmed → finalized

```

Authentication for clients is handled using **Magic Link access tokens** (no passwords).

---

# 2. Business Rules

## Operating Schedule

| Rule | Value |
|-----|------|
Opening time | 10:00
Last session start | 21:00
Closed day | Sunday
Time resolution | 1 hour
Session length | 2 hours

Example valid start times:

```

10:00
11:00
12:00
...
21:00

```

---

## Cleaning Buffer Rule

Normal session:

```

buffer_start = session_start - 1h
buffer_end   = session_end + 1h

```

Morning first slot:

```

session_start = 10:00
buffer_start = session_start

```

Purpose:

- cleaning
- preparation
- changeover

---

# 3. Reservation Workflow

## Step 1 — Client creates provisional reservation

Client submits:

- desired start time
- name
- email
- optional note

System creates:

```

Booking.status = pending

```

No price or options yet.

---

## Step 2 — Admin review

Admin decides whether to approve.

Possible checks:

- blacklist
- event conflicts
- manual scheduling
- blocked dates

Admin action:

```

status → confirmed

```

System generates:

- magic link token
- expiry timestamp

Client receives email containing the link.

---

## Step 3 — Client accesses MyPage

Client opens:

```

/mypage?token=xxxxx

```

Token is validated.

Client must input:

- option selections
- discount declarations
- confirmation

System calculates final price.

Booking becomes:

```

status → finalized

```

---

# 4. Authentication Model

## Magic Link

Example URL

```

[https://example.com/mypage?token=xxxxx](https://example.com/mypage?token=xxxxx)

```

Token properties:

- random 256-bit
- URL safe
- single booking scope
- expiry limit

Recommended generation:

```

secrets.token_urlsafe(32)

```

---

# 5. Database Schema

## Client

Stores minimal customer information.

| column | type |
|------|------|
id | PK
name | TEXT
email | TEXT
created_at | TIMESTAMP

---

## AvailableSlot

Represents potential start times.

| column | type |
|------|------|
id | PK
start_at | TIMESTAMPTZ
status | TEXT

status:

```

open
blocked

```

---

## Booking

Main reservation record.

| column | type |
|------|------|
id | PK
client_id | FK
slot_id | FK
status | TEXT
session_start | TIMESTAMPTZ
session_end | TIMESTAMPTZ
buffered_start | TIMESTAMPTZ
buffered_end | TIMESTAMPTZ
access_token | TEXT
token_expiry | TIMESTAMPTZ
token_used | BOOLEAN
note | TEXT
admin_note | TEXT
created_at | TIMESTAMP
finalized_at | TIMESTAMP

Status values:

```

pending
confirmed
finalized
rejected

```

---

## BookingOption

Stores final option selections.

| column | type |
|------|------|
id | PK
booking_id | FK
option_name | TEXT
quantity | INTEGER
unit_price | INTEGER
total_price | INTEGER

Example options:

- Personal service (15min unit)
- Towel rental
- other optional service

---

## BlockedDatetime

Admin defined unavailable time ranges.

| column | type |
|------|------|
id | PK
start_at | TIMESTAMPTZ
end_at | TIMESTAMPTZ
reason | TEXT

Used for:

- events
- holidays
- manual blocks

---

## Blacklist

Clients that cannot reserve.

| column | type |
|------|------|
id | PK
email | TEXT
reason | TEXT
created_at | TIMESTAMP

---

# 6. Slot Conflict Control

Confirmed bookings must prevent overlapping buffered ranges.

Concept:

```

[buffered_start, buffered_end]

```

Must not intersect.

PostgreSQL constraint example:

```

EXCLUDE USING GIST (
tstzrange(buffered_start, buffered_end) WITH &&
)

```

---

# 7. API Design (Conceptual)

## Public API

Create reservation

```

POST /api/reservation

```

Return:

```

booking_id
status=pending

```

---

## Admin API

Approve reservation

```

POST /api/admin/confirm

```

Actions:

- compute buffers
- generate token
- send email

---

## Client MyPage

```

GET /api/mypage?token=xxxxx

```

Returns:

- booking info
- option inputs

---

## Finalize reservation

```

POST /api/finalize

```

Stores:

- options
- final price
- discount declaration

---

# 8. Security Model

Requirements:

- HTTPS only
- random token
- token expiry
- rate limiting

Token validation rules:

```

token exists
AND expiry > now()
AND booking.status IN ('confirmed','finalized')

```

---

# 9. Frontend Interaction

Candidate technologies:

- HTMX
- Vue

Example slot search UI:

Filters:

```

next available
weekend only
evening
date specific

```

Query returns available slots sorted by:

```

start_at ASC

```

---

# 10. Future Extension

Possible improvements:

- multiple counselors
- calendar sync
- automatic scheduling
- payment integration
- notification automation

---

# 11. Architecture Summary

System type:

```

Low traffic reservation system
single counselor
manual approval workflow
magic link authentication

```

Design priorities:

- simplicity
- safety
- minimal authentication friction
- manual operational control
```
