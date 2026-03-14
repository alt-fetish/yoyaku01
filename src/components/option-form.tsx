import { FC } from 'hono/jsx'

type Props = {
  bookingId: string
  token: string
  sessionStart: string
  sessionEnd: string
  currentNote?: string
  selectedOptionKeys?: string[]
}

export const OPTIONS = [
  { key: 'vacuum_bed',    label: 'バキュームベッド15分' },
  { key: 'tight_bondage', label: 'ギチギチ拘束体験15分' },
  { key: 'hug_touch',     label: 'ハグ＆タッチ15分' },
  { key: 'crossdressing', label: '女装' },
] as const

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export const OptionForm: FC<Props> = ({
  bookingId, token, sessionStart, sessionEnd,
  currentNote = '', selectedOptionKeys = [],
}) => {
  return (
    <div>
      <div class="card mb-6">
        <h2>予約内容</h2>
        <p style="margin-top:8px;font-weight:500">
          {formatDateTime(sessionStart)} ～{' '}
          {new Date(sessionEnd).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>

      <form method="post" action="/api/finalize">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="token" value={token} />

        <div class="card mb-4">
          <h3 style="margin-bottom:16px">体験オプションを選択してください</h3>
          <p class="text-muted mb-4">複数選択可能です。</p>

          <div style="display:flex;flex-direction:column;gap:14px">
            {OPTIONS.map((opt) => (
              <label key={opt.key} style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:14px 16px;border:1.5px solid #e5e7eb;border-radius:8px">
                <input
                  type="checkbox"
                  name={opt.key}
                  value="1"
                  checked={selectedOptionKeys.includes(opt.key)}
                  style="width:20px;height:20px;cursor:pointer;accent-color:#2563eb;flex-shrink:0"
                />
                <span style="font-size:16px;font-weight:500">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div class="card mb-6">
          <h3 style="margin-bottom:12px">メッセージ</h3>
          <p class="text-muted mb-4">ご要望・質問などがあればご記入ください。</p>
          <textarea
            name="note"
            style="width:100%;padding:12px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;font-family:inherit;min-height:100px;resize:vertical"
          >{currentNote}</textarea>
        </div>

        <button type="submit" class="btn btn-primary btn-block">
          {selectedOptionKeys.length > 0 || currentNote ? '内容を更新する' : '予約を確定する'}
        </button>
      </form>
    </div>
  )
}
