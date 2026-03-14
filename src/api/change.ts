import { Hono } from 'hono'
import { Env, getDB } from '../lib/db'
import { isTokenValid } from '../lib/token'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /api/change/accept
 * Body: token, proposal_id
 * Client accepts the proposed slot change.
 */
app.post('/accept', async (c) => {
  const body = await c.req.parseBody()
  const token = String(body.token ?? '').trim()
  const proposalId = String(body.proposal_id ?? '').trim()

  if (!token || !proposalId) return c.redirect('/mypage?notice=invalid')

  const db = getDB(c.env)

  // Validate token
  const { data: booking } = await db
    .from('bookings')
    .select('id, slot_id, session_start, session_end, access_token, token_expiry, token_used, status')
    .eq('access_token', token)
    .single()

  if (!booking || !isTokenValid(booking)) {
    return c.redirect(`/mypage?token=${token}&notice=invalid`)
  }

  // Get pending proposal
  const { data: proposal } = await db
    .from('booking_change_proposals')
    .select('*, available_slots!proposed_slot_id(start_at)')
    .eq('id', proposalId)
    .eq('booking_id', booking.id)
    .eq('status', 'pending')
    .single()

  if (!proposal) {
    return c.redirect(`/mypage?token=${token}&notice=proposal_not_found`)
  }

  // Check expiry
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    await db
      .from('booking_change_proposals')
      .update({ status: 'expired' })
      .eq('id', proposalId)
    return c.redirect(`/mypage?token=${token}&notice=proposal_expired`)
  }

  // Check slot is still available (optimistic: no lock during negotiation)
  const { data: conflicting } = await db
    .from('bookings')
    .select('id')
    .eq('slot_id', proposal.proposed_slot_id)
    .in('status', ['pending', 'confirmed', 'finalized'])
    .neq('id', booking.id)
    .maybeSingle()

  if (conflicting) {
    // Slot was taken by another booking during negotiation
    await db
      .from('booking_change_proposals')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', proposalId)
    await db.from('chat_messages').insert({
      booking_id: booking.id,
      sender_type: 'system',
      message: '提案されたスロットは既に他の予約で埋まっています。管理者に再提案を依頼してください。',
    })
    return c.redirect(`/mypage?token=${token}&notice=slot_taken`)
  }

  const newSlotStart = new Date(proposal.available_slots.start_at)
  const newSessionEnd = new Date(newSlotStart.getTime() + 2 * 60 * 60 * 1000)

  // Recalculate buffer times
  const startHourJST = parseInt(
    newSlotStart.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      hour12: false,
    })
  )
  const bufferedStart =
    startHourJST === 10
      ? newSlotStart
      : new Date(newSlotStart.getTime() - 60 * 60 * 1000)
  const bufferedEnd = new Date(newSessionEnd.getTime() + 60 * 60 * 1000)

  // Update booking: switch to new slot + recalculate times
  const { error: updateError } = await db.from('bookings').update({
    slot_id: proposal.proposed_slot_id,
    session_start: newSlotStart.toISOString(),
    session_end: newSessionEnd.toISOString(),
    buffered_start: bufferedStart.toISOString(),
    buffered_end: bufferedEnd.toISOString(),
  }).eq('id', booking.id)

  if (updateError) {
    // GIST EXCLUDE constraint violation (buffer overlap)
    await db.from('chat_messages').insert({
      booking_id: booking.id,
      sender_type: 'system',
      message: '提案されたスロットは既に他の予約で埋まっています。管理者に再提案を依頼してください。',
    })
    return c.redirect(`/mypage?token=${token}&notice=slot_taken`)
  }

  // Mark proposal as accepted
  await db
    .from('booking_change_proposals')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', proposalId)

  // Insert system chat message
  await db.from('chat_messages').insert({
    booking_id: booking.id,
    sender_type: 'system',
    message: '日程変更が承認されました。',
  })

  return c.redirect(`/mypage?token=${token}&notice=accepted`)
})

/**
 * POST /api/change/reject
 * Body: token, proposal_id
 * Client rejects the proposed slot change.
 */
app.post('/reject', async (c) => {
  const body = await c.req.parseBody()
  const token = String(body.token ?? '').trim()
  const proposalId = String(body.proposal_id ?? '').trim()

  if (!token || !proposalId) return c.redirect('/mypage?notice=invalid')

  const db = getDB(c.env)

  // Validate token
  const { data: booking } = await db
    .from('bookings')
    .select('id, access_token, token_expiry, token_used, status')
    .eq('access_token', token)
    .single()

  if (!booking || !isTokenValid(booking)) {
    return c.redirect(`/mypage?token=${token}&notice=invalid`)
  }

  // Get pending proposal
  const { data: proposal } = await db
    .from('booking_change_proposals')
    .select('id, proposed_slot_id')
    .eq('id', proposalId)
    .eq('booking_id', booking.id)
    .eq('status', 'pending')
    .single()

  if (!proposal) {
    return c.redirect(`/mypage?token=${token}&notice=proposal_not_found`)
  }

  // Mark proposal as rejected
  await db
    .from('booking_change_proposals')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', proposalId)

  // Insert system chat message
  await db.from('chat_messages').insert({
    booking_id: booking.id,
    sender_type: 'system',
    message: '日程変更の提案を断りました。',
  })

  return c.redirect(`/mypage?token=${token}&notice=rejected`)
})

export default app
