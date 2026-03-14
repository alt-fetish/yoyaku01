import { Hono } from 'hono'
import { Env } from '../lib/db'
import { Layout } from '../components/layout'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => {
  return c.html(
    <Layout title="ラバー試着体験予約">
      {/* ── Hero ─────────────────────────────── */}
      <section class="mb-8 text-center" style="padding-top:32px">
        <h1>ラバー試着体験予約</h1>
        <p class="text-muted mt-4" style="font-size:17px;line-height:1.7">
          完全予約制・完全個室のラバー試着体験サービス。
          <br />
          あなたのペースで、安心してご相談いただけます。
        </p>
        <a href="/reserve" class="btn btn-primary" style="margin-top:28px;padding:16px 40px;font-size:18px">
          予約する
        </a>
      </section>

      <hr class="divider" />

      {/* ── Service details ───────────────────── */}
      <section class="mb-8">
        <h2>セッション詳細</h2>
        <div class="card">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              {[
                ['セッション時間', '2時間'],
                ['営業時間', '10:00 〜 21:00'],
                ['定休日', '日曜日'],
                ['ご予約方法', '完全オンライン予約制'],
              ].map(([label, value]) => (
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:12px 0;color:#6b7280;width:45%">{label}</td>
                  <td style="padding:12px 0;font-weight:500">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────── */}
      <section class="mb-8">
        <h2>料金</h2>
        <div class="card">
          <p style="font-size:28px;font-weight:700;color:#1e3a5f">
            ¥8,800
            <span class="text-muted" style="font-size:16px;font-weight:400"> （基本料金）</span>
          </p>
          <div class="alert alert-info mt-4">
            割引条件によって最終料金が変わる場合があります。
            <br />
            最終料金はご予約確定時にご確認いただけます。
          </div>
          <p class="text-muted mt-4" style="font-size:14px;line-height:1.8">
            ・オプション追加料金あり（タオルレンタル・パーソナルサービスなど）
            <br />
            ・割引の適用はご来店当日に確認いたします
          </p>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────── */}
      <section class="text-center">
        <h2>ご予約の流れ</h2>
        <div class="card" style="text-align:left">
          {[
            ['①', '予約フォームから希望日時を選択'],
            ['②', '管理者が内容を確認・承認'],
            ['③', '承認後にメールでリンクが届きます'],
            ['④', 'リンクよりオプション選択・最終確定'],
          ].map(([step, text]) => (
            <div style="display:flex;gap:16px;padding:10px 0;border-bottom:1px solid #f3f4f6">
              <span style="font-weight:700;color:#2563eb;min-width:24px">{step}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <a href="/reserve" class="btn btn-primary btn-block mt-6" style="font-size:18px;padding:16px">
          予約する
        </a>
      </section>
    </Layout>
  )
})

export default app
