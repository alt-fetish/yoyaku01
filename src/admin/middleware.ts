import { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { createClient } from '@supabase/supabase-js'
import { Env } from '../lib/db'

export async function getAdminUser(c: Context<{ Bindings: Env }>) {
  const token = getCookie(c, 'admin_token')
  if (!token) return null

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}
