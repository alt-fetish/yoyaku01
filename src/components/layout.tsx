import { FC } from 'hono/jsx'

type Props = {
  title?: string
  children: any
}

export const Layout: FC<Props> = ({ title = 'ラバー試着体験予約', children }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <script src="https://unpkg.com/htmx.org@2.0.4" defer />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <style>{globalCSS}</style>
      </head>
      <body>
        <header class="site-header">
          <a href="/" class="site-logo">ラバー試着体験予約</a>
        </header>
        <main class="main-content">{children}</main>
        <footer class="site-footer">
          <p>© 2026 Counseling Office</p>
        </footer>
      </body>
    </html>
  )
}

const globalCSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Noto Sans JP', sans-serif;
  background: #f8f7f4;
  color: #1a1a1a;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.site-header {
  background: #1e3a5f;
  padding: 16px 24px;
}

.site-logo {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  letter-spacing: 0.03em;
}

.main-content {
  flex: 1;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 20px 64px;
}

.site-footer {
  background: #1e3a5f;
  color: #94a3b8;
  text-align: center;
  padding: 16px;
  font-size: 13px;
}

/* ── Buttons ── */
.btn {
  display: inline-block;
  padding: 14px 28px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  text-decoration: none;
  text-align: center;
  transition: opacity 0.15s;
}
.btn:hover { opacity: 0.85; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-danger  { background: #dc2626; color: #fff; }
.btn-outline { background: #fff; color: #2563eb; border: 2px solid #2563eb; }
.btn-block   { display: block; width: 100%; }
.btn-sm { padding: 8px 16px; font-size: 14px; }

/* ── Forms ── */
.form-group {
  margin-bottom: 20px;
}
.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #374151;
}
.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 16px;
  background: #fff;
  font-family: inherit;
  transition: border-color 0.15s;
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
}
.form-group textarea { min-height: 80px; resize: vertical; }

/* ── Cards ── */
.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  margin-bottom: 20px;
}

/* ── Slot list ── */
.slot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  margin-bottom: 10px;
}
.slot-time {
  font-size: 17px;
  font-weight: 600;
}

/* ── Alert boxes ── */
.alert {
  padding: 14px 18px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 15px;
}
.alert-info    { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.alert-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.alert-error   { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }

/* ── Section heading ── */
h1 { font-size: 26px; font-weight: 700; margin-bottom: 8px; }
h2 { font-size: 20px; font-weight: 700; margin-bottom: 16px; }
h3 { font-size: 17px; font-weight: 600; margin-bottom: 12px; }

/* ── Utility ── */
.text-muted  { color: #6b7280; font-size: 14px; }
.text-center { text-align: center; }
.mb-4  { margin-bottom: 16px; }
.mb-6  { margin-bottom: 24px; }
.mb-8  { margin-bottom: 32px; }
.mt-4  { margin-top: 16px; }
.mt-6  { margin-top: 24px; }
.divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }

/* ── HTMX indicator ── */
.htmx-indicator { display: none; }
.htmx-request .htmx-indicator { display: inline; }
`
