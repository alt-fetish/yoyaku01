```markdown
# plan-frontend.md
Counseling Session Reservation Frontend Specification  
Stack: **Hono + HTMX + Cloudflare Workers**

---

# 1. Overview

This frontend provides a **lightweight reservation interface** for a counseling session system.

Design goals:

- Minimal JavaScript
- Fast rendering
- Mobile friendly
- No SPA complexity
- Compatible with **Cloudflare Workers**

Technology stack:

```

Hono (router)
HTMX (partial updates)
Server-side HTML rendering
Cloudflare Workers deployment

```

No client-side framework (React/Vue) is required.

---

# 2. Page Structure

Site consists of **4 main pages**.

| Page | Path | Purpose |
|-----|-----|-----|
Landing page | `/` | Service explanation |
Reservation page | `/reserve` | Search and create provisional reservation |
Reservation submitted | `/reserve/complete` | Pending reservation confirmation |
Client MyPage | `/mypage?token=` | Confirmed reservation management |

---

# 3. UI Flow

User journey:

```

Landing
↓
Reserve Page
↓
Search Available Slots
↓
Submit Reservation (pending)
↓
Admin Confirmation
↓
Client receives Magic Link
↓
MyPage
↓
Select Options
↓
Finalize Reservation

```

---

# 4. Landing Page

Path:

```

/

```

Purpose:

- Explain the service
- Display basic pricing
- Provide reservation entry

Sections:

```

Hero section
Service description
Session details
Pricing explanation
Reservation button

```

Important note displayed:

```

Basic session price: 8,800 yen

Discounts may apply depending on conditions.
Final price will be shown after confirmation.

```

Call-to-action button:

```

Reserve Session

```

Link:

```

/reserve

```

---

# 5. Reservation Page

Path:

```

/reserve

```

Purpose:

Allow clients to find available session times and submit a provisional reservation.

---

## Input Fields

Client information:

```

Name
Email
Optional message

```

---

## Slot Search Filters

Filters improve usability.

Supported filters:

```

Earliest available
Specific date
Evening only
Weekend only

```

Example UI:

```

Select date
[ 2026-03-20 ]

Filter
[ Evening sessions ]

Search

```

HTMX triggers slot search.

---

# 6. Slot Search

HTMX interaction.

Example request:

```

GET /api/search-slot

```

Query parameters:

```

date
filter

```

Example response:

```

2026-03-20 14:00
2026-03-20 15:00
2026-03-20 16:00

```

Slots sorted:

```

start_time ASC

````

Each slot shows a **Reserve button**.

---

## HTMX Example

```html
<select
  name="filter"
  hx-get="/api/search-slot"
  hx-target="#slot-results"
  hx-trigger="change">
</select>

<div id="slot-results"></div>
````

---

# 7. Slot List Component

Rendered server-side.

Example:

```
Available Sessions

2026/03/20 14:00
[ Reserve ]

2026/03/20 15:00
[ Reserve ]

2026/03/20 16:00
[ Reserve ]
```

Button action:

```
POST /api/create-reservation
```

Payload:

```
slot_id
name
email
note
```

---

# 8. Reservation Completion Page

Path:

```
/reserve/complete
```

Displayed after provisional reservation.

Content:

```
Your reservation request has been received.

This reservation is currently pending approval.

Once confirmed, you will receive an email with a link to manage your reservation.
```

---

# 9. Client MyPage

Accessed via magic link.

Example:

```
/mypage?token=xxxx
```

Authentication handled by backend token validation.

If token invalid:

```
Invalid or expired link.
```

---

## MyPage Contents

Displayed information:

```
Reservation Date
Session Time
Important instructions
Option selection form
```

Example:

```
Reservation Date
March 20, 2026
14:00 – 16:00
```

---

# 10. Option Selection

Clients must select required options before finalizing reservation.

Example options:

```
Personal Service (15 min units)
Towel Rental
Other optional service
```

UI example:

```
Personal Service
[ 0 ] 15 min units

Towel Rental
[ yes / no ]
```

Discount declaration section:

```
I qualify for discount conditions

[ ] Under 40 years old
[ ] Previous shop customer
[ ] Event participant
[ ] Suit brought by client
```

Note:

```
Discount verification will be confirmed on the day of service.
```

---

# 11. Finalization

Submit endpoint:

```
POST /api/finalize
```

Result:

```
Reservation finalized successfully
```

Confirmation display:

```
Reservation Confirmed

Date
Options
Final price
```

---

# 12. Mobile UX Requirements

Target devices:

```
Smartphones
```

Requirements:

* Buttons large enough for touch
* Vertical layout
* Minimal scrolling
* Clear slot selection

---

# 13. Security Requirements

Client-side security considerations:

```
All requests via HTTPS
Magic link token never stored in local storage
Token only transmitted via URL parameter
```

HTMX requests must include CSRF protection if session cookies are used.

---

# 14. Component Structure

Suggested component layout:

```
/components

layout.tsx
slot-list.tsx
reservation-form.tsx
option-form.tsx
confirmation-view.tsx
```

---

# 15. Directory Structure

Recommended project structure:

```
/app
  index.tsx
  reserve.tsx
  mypage.tsx

/api
  search-slot.ts
  create-reservation.ts
  finalize.ts

/components
  slot-list.tsx
  option-form.tsx

/lib
  api.ts
  token.ts

/styles
  main.css
```

---

# 16. Styling

Recommended:

```
Tailwind CSS
```

Advantages:

* small CSS footprint
* fast prototyping
* good mobile support

Alternatively:

```
simple CSS
```

is acceptable.

---

# 17. Performance Targets

Target metrics:

```
First render < 200ms
JS payload < 50KB
Edge response time < 100ms
```

HTMX reduces JavaScript overhead.

---

# 18. Deployment

Deployment target:

```
Cloudflare Workers
```

Command:

```
wrangler deploy
```

Workers handles:

```
routing
HTML rendering
API endpoints
```

---

# 19. Future Enhancements

Possible improvements:

```
calendar UI
push notifications
reservation reminders
multiple counselors
payment integration
```

---

# 20. Summary

Frontend architecture:

```
Hono
+
HTMX
+
Server-rendered HTML
+
Cloudflare Workers
```

Advantages:

* simple
* fast
* secure
* easy to maintain
* ideal for low traffic reservation systems


