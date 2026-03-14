-- ─────────────────────────────────────────
-- chat_messages
-- ─────────────────────────────────────────
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'admin', 'system')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_booking_id ON chat_messages (booking_id);

-- ─────────────────────────────────────────
-- booking_change_proposals
-- ─────────────────────────────────────────
CREATE TABLE booking_change_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  proposed_slot_id UUID NOT NULL REFERENCES available_slots(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at     TIMESTAMPTZ
);

CREATE INDEX idx_booking_change_proposals_booking_id ON booking_change_proposals (booking_id);
CREATE INDEX idx_booking_change_proposals_status     ON booking_change_proposals (status);

-- ─────────────────────────────────────────
-- Add 'cancelled' booking status
-- ─────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'finalized', 'rejected', 'cancelled'));

-- RLS は全テーブル無効（認証はサーバー側の access_token + isTokenValid で行う）
ALTER TABLE chat_messages            DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_change_proposals DISABLE ROW LEVEL SECURITY;
