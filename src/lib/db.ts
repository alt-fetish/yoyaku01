import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type Env = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  ADMIN_SECRET: string
  MAGIC_LINK_BASE_URL: string
  TOKEN_EXPIRY_HOURS: string
}

export function getDB(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

export type SlotStatus = 'open' | 'blocked'
export type BookingStatus = 'pending' | 'confirmed' | 'finalized' | 'rejected' | 'cancelled'
export type SenderType = 'client' | 'admin' | 'system'
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

export type Client = {
  id: string
  name: string
  email: string
  created_at: string
}

export type AvailableSlot = {
  id: string
  start_at: string
  status: SlotStatus
}

export type Booking = {
  id: string
  client_id: string
  slot_id: string
  status: BookingStatus
  session_start: string
  session_end: string
  buffered_start: string | null
  buffered_end: string | null
  access_token: string | null
  token_expiry: string | null
  token_used: boolean
  note: string | null
  admin_note: string | null
  final_price: number | null
  created_at: string
  finalized_at: string | null
}

export type BookingOption = {
  id: string
  booking_id: string
  option_name: string
  quantity: number
  unit_price: number
  total_price: number
}

export type ChatMessage = {
  id: string
  booking_id: string
  sender_type: SenderType
  message: string
  created_at: string
}

export type BookingChangeProposal = {
  id: string
  booking_id: string
  proposed_slot_id: string
  status: ProposalStatus
  expires_at: string | null
  created_at: string
  responded_at: string | null
}
