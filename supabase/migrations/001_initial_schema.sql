-- Enable btree_gist extension for EXCLUDE constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────
CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_email ON clients (email);

-- ─────────────────────────────────────────
-- available_slots
-- Represents schedulable start times managed by admin.
-- ─────────────────────────────────────────
CREATE TABLE available_slots (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL UNIQUE,
  status   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'blocked'))
);

CREATE INDEX idx_available_slots_start_at ON available_slots (start_at);

-- ─────────────────────────────────────────
-- bookings
-- ─────────────────────────────────────────
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients (id),
  slot_id         UUID NOT NULL REFERENCES available_slots (id),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'finalized', 'rejected')),
  session_start   TIMESTAMPTZ NOT NULL,
  session_end     TIMESTAMPTZ NOT NULL,
  -- buffered_start/end are set when admin confirms
  buffered_start  TIMESTAMPTZ,
  buffered_end    TIMESTAMPTZ,
  -- magic link fields
  access_token    TEXT UNIQUE,
  token_expiry    TIMESTAMPTZ,
  token_used      BOOLEAN NOT NULL DEFAULT false,
  -- notes
  note            TEXT,
  admin_note      TEXT,
  -- final price (set on finalize)
  final_price     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at    TIMESTAMPTZ,

  CONSTRAINT bookings_session_order CHECK (session_end > session_start)
);

CREATE INDEX idx_bookings_status     ON bookings (status);
CREATE INDEX idx_bookings_access_token ON bookings (access_token);
CREATE INDEX idx_bookings_slot_id    ON bookings (slot_id);

-- Prevent overlapping buffered ranges for confirmed/finalized bookings
-- Uses GIST exclusion constraint on tstzrange
ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_buffer
  EXCLUDE USING GIST (
    tstzrange(buffered_start, buffered_end, '[)') WITH &&
  )
  WHERE (status IN ('confirmed', 'finalized') AND buffered_start IS NOT NULL);

-- ─────────────────────────────────────────
-- booking_options
-- ─────────────────────────────────────────
CREATE TABLE booking_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0,
  unit_price  INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_booking_options_booking_id ON booking_options (booking_id);

-- ─────────────────────────────────────────
-- blocked_datetimes
-- Admin-defined unavailable ranges (events, holidays, etc.)
-- ─────────────────────────────────────────
CREATE TABLE blocked_datetimes (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL,
  end_at   TIMESTAMPTZ NOT NULL,
  reason   TEXT,
  CONSTRAINT blocked_datetimes_order CHECK (end_at > start_at)
);

-- ─────────────────────────────────────────
-- blacklist
-- Clients that cannot make reservations.
-- ─────────────────────────────────────────
CREATE TABLE blacklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS は全テーブル無効（認証はサーバー側の access_token + isTokenValid で行う）
-- Supabase への接続は Cloudflare Workers 内のみで行い、SUPABASE_ANON_KEY はブラウザに渡さない
ALTER TABLE clients           DISABLE ROW LEVEL SECURITY;
ALTER TABLE available_slots   DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings          DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_options   DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_datetimes DISABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist         DISABLE ROW LEVEL SECURITY;
