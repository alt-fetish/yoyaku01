import { FC } from 'hono/jsx'
import { AvailableSlot } from '../lib/db'

type Props = {
  slots: AvailableSlot[]
  selectedSlotId?: string
}

function formatSlotTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SlotList: FC<Props> = ({ slots, selectedSlotId }) => {
  if (slots.length === 0) {
    return (
      <div class="alert alert-warning">
        該当する空き時間が見つかりませんでした。条件を変えて再検索してください。
      </div>
    )
  }

  return (
    <div id="slot-results">
      <p class="text-muted mb-4">空き枠 {slots.length} 件</p>
      {slots.map((slot) => (
        <div class="slot-item" key={slot.id}>
          <span class="slot-time">{formatSlotTime(slot.start_at)}</span>
          <button
            class="btn btn-primary btn-sm"
            hx-post="/api/select-slot"
            hx-target="#reservation-form-container"
            hx-vals={JSON.stringify({ slot_id: slot.id, slot_time: slot.start_at })}
            hx-swap="innerHTML show:#reservation-form-container:top"
          >
            この時間を選ぶ
          </button>
        </div>
      ))}
    </div>
  )
}

export const SlotListEmpty: FC = () => (
  <div id="slot-results">
    <p class="text-muted">検索条件を選択してください。</p>
  </div>
)
