import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { SlotList } from '../components/slot-list'

const app = new Hono<{ Bindings: Env }>()

/**
 * GET /api/search-slot
 * Query params:
 *   date   — YYYY-MM-DD (optional)
 *   filter — all | earliest | evening | weekend
 *
 * Returns server-rendered slot list HTML (for HTMX swap).
 */
app.get('/', async (c) => {
  const date = c.req.query('date') // e.g. "2026-03-20"
  const filter = c.req.query('filter') ?? 'all'

  const db = getDB(c.env)
  const cutoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  let query = db
    .from('available_slots')
    .select('*')
    .eq('status', 'open')
    .gt('start_at', cutoff)
    .order('start_at', { ascending: true })
    .limit(30)

  // Date filter
  if (date) {
    // Inclusive day range in JST — convert to UTC boundaries
    const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
    const dayEnd   = new Date(`${date}T23:59:59+09:00`).toISOString()
    query = query.gte('start_at', dayStart).lte('start_at', dayEnd)
  }

  // Named filters
  if (filter === 'earliest') {
    query = query.limit(5)
  } else if (filter === 'evening') {
    // 18:00〜 JST = 09:00 UTC (offset by -9h)
    // We'll filter post-fetch since Supabase can't easily do hour-of-day in UTC→JST
    // Use a simpler approach: >= 09:00 UTC each day
  } else if (filter === 'weekend') {
    // Saturday only (Sunday is closed)
    // Filter post-fetch
  }

  const { data: slots, error } = await query

  if (error) {
    return c.html(
      <div class="alert alert-error">検索中にエラーが発生しました。</div>
    )
  }

  let filtered = slots ?? []

  // Post-fetch filters that need JS date manipulation
  if (filter === 'evening') {
    filtered = filtered.filter((s) => {
      const h = new Date(s.start_at).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: 'numeric',
        hour12: false,
      })
      return parseInt(h) >= 18
    })
  } else if (filter === 'weekend') {
    filtered = filtered.filter((s) => {
      // Saturday = 6 in JST
      const dow = new Date(
        new Date(s.start_at).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })
      ).getDay()
      return dow === 6
    })
  }

  // ── アクティブな予約のバッファ範囲を動的に計算して除外 ──────────────────
  // pending/confirmed/finalized な予約の session_start を全件取得
  const { data: activeBookings } = await db
    .from('bookings')
    .select('slot_id, session_start')
    .in('status', ['pending', 'confirmed', 'finalized'])

  if (activeBookings && activeBookings.length > 0) {
    // 各予約ごとに「ブロックされる時間帯」を計算
    // - 前1時間（ただし10:00スタートは前バッファなし）
    // - 予約スロット自身
    // - 後3時間（start+1h, start+2h, start+3h）
    const blockedTimes = new Set<number>()
    const bookedSlotIds = new Set<string>()

    for (const b of activeBookings) {
      bookedSlotIds.add(b.slot_id)

      const start = new Date(b.session_start).getTime()

      // JSTでの開始時刻（時）を取得
      const startHourJST = parseInt(
        new Date(b.session_start).toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          hour: 'numeric',
          hour12: false,
        })
      )

      const ONE_HOUR = 60 * 60 * 1000

      // 前1時間（10:00スタートはスキップ）
      if (startHourJST !== 10) {
        blockedTimes.add(start - ONE_HOUR)
      }
      // 後2時間
      blockedTimes.add(start + ONE_HOUR)
      blockedTimes.add(start + ONE_HOUR * 2)
    }

    filtered = filtered.filter((s) => {
      const t = new Date(s.start_at).getTime()
      // 予約スロット自身 or バッファ範囲内ならNG
      return !bookedSlotIds.has(s.id) && !blockedTimes.has(t)
    })
  }

  return c.html(<SlotList slots={filtered} />)
})

export default app
