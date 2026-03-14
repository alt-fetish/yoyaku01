import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { createClient } from '@supabase/supabase-js'
import { Env } from '../lib/db'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => {
  const notice = c.req.query('notice')
  return c.html(<LoginPage error={notice === 'unauthorized' ? 'ログインが必要です' : undefined} />)
})

app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const email    = String(body.email    ?? '').trim()
  const password = String(body.password ?? '').trim()

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return c.html(<LoginPage error="メールアドレスまたはパスワードが正しくありません" />, 401)
  }

  setCookie(c, 'admin_token', data.session.access_token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1日
  })

  return c.redirect('/admin')
})

function LoginPage({ error }: { error?: string }) {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>管理者ログイン</title>
        <style>{css}</style>
      </head>
      <body>
        <div class="login-wrap">
          <div class="login-card">
            <h1>管理者ログイン</h1>
            <p class="subtitle">ラバー試着体験予約 管理画面</p>
            {error && <div class="error-box">{error}</div>}
            <form method="post" action="/admin/login">
              <div class="field">
                <label>メールアドレス</label>
                <input type="email" name="email" required autofocus />
              </div>
              <div class="field">
                <label>パスワード</label>
                <input type="password" name="password" required />
              </div>
              <button type="submit" class="btn-login">ログイン</button>
            </form>
          </div>
        </div>
      </body>
    </html>
  )
}

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-wrap { width: 100%; max-width: 400px; padding: 24px; }
.login-card { background: #fff; border-radius: 12px; padding: 40px 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
h1 { font-size: 22px; color: #1e3a5f; margin-bottom: 4px; }
.subtitle { color: #9ca3af; font-size: 14px; margin-bottom: 28px; }
.error-box { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 14px; border-radius: 6px; font-size: 14px; margin-bottom: 20px; }
.field { margin-bottom: 18px; }
.field label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.field input { width: 100%; padding: 11px 14px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 15px; }
.field input:focus { outline: none; border-color: #2563eb; }
.btn-login { width: 100%; background: #1e3a5f; color: #fff; border: none; border-radius: 8px; padding: 13px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
.btn-login:hover { background: #1e40af; }
`

export default app
