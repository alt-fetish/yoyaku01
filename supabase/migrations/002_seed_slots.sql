-- Seed available slots for the next 90 days
-- Mon–Sat, 10:00–21:00 JST (UTC+9), 1-hour resolution

DO $$
DECLARE
  d   DATE;
  h   INTEGER;
  ts  TIMESTAMPTZ;
BEGIN
  FOR i IN 0..89 LOOP
    -- JSTの今日を基準にする
    d := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE + i;
    -- 日曜（dow=0）はスキップ
    IF EXTRACT(DOW FROM d) = 0 THEN
      CONTINUE;
    END IF;
    FOR h IN 10..21 LOOP
      ts := (d::TEXT || ' ' || lpad(h::TEXT, 2, '0') || ':00:00 Asia/Tokyo')::TIMESTAMPTZ;
      INSERT INTO available_slots (start_at, status)
      VALUES (ts, 'open')
      ON CONFLICT (start_at) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
