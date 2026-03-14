import { Hono } from 'hono'
import { Env } from '../lib/db'
import { Layout } from '../components/layout'
import { SlotListEmpty } from '../components/slot-list'

const app = new Hono<{ Bindings: Env }>()

// GET /reserve — 予約ページ
app.get('/', (c) => {
  return c.html(
    <Layout title="予約する｜ラバー試着体験予約">
      <h1 class="mb-6">予約する</h1>

      {/* ── Step indicator ───────────────────── */}
      <div class="alert alert-info mb-6">
        <strong>予約の流れ：</strong>
        希望日時を選択 → お客様情報を入力 → 送信（仮予約）→ 管理者承認後にメールでご連絡
      </div>

      {/* ── Slot search ───────────────────────── */}
      <div class="card mb-6">
        <h2>空き時間を検索</h2>

        <div class="form-group">
          <label for="search-date">日付を選択</label>
          <input
            type="date"
            id="search-date"
            name="date"
            hx-get="/api/search-slot"
            hx-target="#slot-results"
            hx-trigger="change"
            hx-include="[name='filter']"
            hx-indicator="#search-spinner"
          />
        </div>

        <div class="form-group">
          <label for="search-filter">絞り込み</label>
          <select
            id="search-filter"
            name="filter"
            hx-get="/api/search-slot"
            hx-target="#slot-results"
            hx-trigger="change"
            hx-include="[name='date']"
            hx-indicator="#search-spinner"
          >
            <option value="all">すべて</option>
            <option value="earliest">最短で空いている</option>
            <option value="evening">夜のみ（18時以降）</option>
            <option value="weekend">土曜のみ</option>
          </select>
        </div>

        <span id="search-spinner" class="htmx-indicator text-muted" style="font-size:14px">
          検索中...
        </span>

        {/* Slot results injected here by HTMX */}
        <SlotListEmpty />
      </div>

      {/* ── Reservation form (rendered after slot selection) ── */}
      <div id="reservation-form-container"></div>
    </Layout>
  )
})

// GET /reserve/complete — 仮予約完了ページ
app.get('/complete', (c) => {
  return c.html(
    <Layout title="予約受付完了｜ラバー試着体験予約">
      <div class="text-center" style="padding-top:48px">
        <div style="font-size:56px;margin-bottom:16px">✅</div>
        <h1 class="mb-4">仮予約を受け付けました</h1>
        <p style="font-size:17px;line-height:1.8;color:#374151">
          ご予約リクエストを受け付けました。
          <br />
          現在、内容を確認中です。
        </p>

        <div class="card mt-6" style="text-align:left;max-width:480px;margin:24px auto 0">
          <h3>次のステップ</h3>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;gap:12px">
              <span style="color:#2563eb;font-weight:700">①</span>
              <span>管理者が内容を確認いたします（通常1〜2営業日）</span>
            </div>
            <div style="display:flex;gap:12px">
              <span style="color:#2563eb;font-weight:700">②</span>
              <span>承認後、ご登録メールアドレスにリンクをお送りします</span>
            </div>
            <div style="display:flex;gap:12px">
              <span style="color:#2563eb;font-weight:700">③</span>
              <span>リンクよりオプション選択・最終確定をお願いします</span>
            </div>
          </div>
        </div>

        <div class="alert alert-warning mt-6" style="max-width:480px;margin:24px auto 0;text-align:left">
          承認されなかった場合もメールにてご連絡いたします。
        </div>

        <a href="/" class="btn btn-outline mt-6">
          トップページへ戻る
        </a>
      </div>
    </Layout>
  )
})

export default app
