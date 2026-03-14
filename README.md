# yoyaku01 — カウンセリングセッション予約システム

シングルカウンセラー向けのオンライン予約・管理システム。クライアントが空き枠を選んで仮予約し、管理者が承認後にMagic Linkをメールで送付。クライアントがMyPageでオプションを確定する、という承認ワークフローを持つ。

---

## 開発背景

ChatGPTでシステム設計・要件定義のプランを作成し、そのプランをベースに Ubuntu Server 上の **Cursor** エディタで **Claude Code（CLI）** を活用して実装した。

---

## 機能概要

### クライアント向け
- **スロット検索・選択**: 日付で絞り込んで空きスロットを一覧表示
- **仮予約フォーム**: 名前・メール・メッセージを入力して仮予約
- **MyPage**: Magic Linkで認証。セッション日時・オプションの確認・変更・確定
- **ブラックリストチェック**: 登録済みメールアドレスは予約不可

### 管理者向け（`/admin`）
- **Basic認証**: Supabase Auth（メール＋パスワード）によるログイン
- **予約ダッシュボード**: pending / confirmed / finalized / rejected をステータス別に一覧表示
- **承認・却下**: 仮予約を承認 → バッファ時間を計算してDBに保存 → Magic Linkメールを自動送信
- **スロット管理**: 日付ごとのスロット一覧表示、個別ブロック/解除、一括ブロック/解除、スロット延伸（+2ヶ月）

### バックエンドロジック
- **バッファ計算**: 承認時にセッション前後のバッファ時間（前1h・後2h）を自動算出（10:00開始の場合は前バッファなし）
- **重複防止**: PostgreSQL GIST EXCLUDE制約でバッファ込み予約の重複を排除
- **Magic Link**: Web Crypto APIによる256bit乱数トークン、72時間有効・1回使い切り
- **メール送信**: Resend APIで確認メールを送信

---

## 予約ステータスフロー

```
仮予約 (pending)
  ├─ 管理者却下 → rejected
  └─ 管理者承認 → confirmed（Magic Linkメール送信）
       └─ クライアントがMyPageでオプション確定 → finalized
```

---

## ビジネスルール

| 項目 | 内容 |
|------|------|
| 営業時間 | 月〜土 10:00〜21:00 |
| 定休日 | 日曜 |
| セッション時間 | 2時間 |
| 前バッファ | 1時間（10:00開始は除く） |
| 後バッファ | 2時間 |
| 最低予約リードタイム | 現在時刻から2時間以上先 |
| 基本料金 | ¥8,800 |

---

## 技術スタック

### フロントエンド / バックエンド
- **[Hono](https://hono.dev/)** — Cloudflare Workers向け軽量Webフレームワーク
- **JSX/TSX** — `hono/jsx` によるサーバーサイドHTMLレンダリング
- **[HTMX](https://htmx.org/)** — AJAXなしのダイナミックHTML操作
- **インラインCSS** — Tailwind不使用。グローバルスタイルは `src/components/layout.tsx` に集約

### インフラ / 外部PaaS

| サービス | 用途 | URL |
|---------|------|-----|
| **Cloudflare Workers** | エッジサーバー実行環境 | https://workers.cloudflare.com |
| **Supabase** | PostgreSQL DB、管理者認証 | https://supabase.com |
| **Resend** | トランザクションメール送信 | https://resend.com |

### 開発ツール
- TypeScript 5.8
- Wrangler 4 (Cloudflare Workers CLI)
- Supabase CLI

---

## ディレクトリ構成

```
yoyaku01/
├── src/
│   ├── index.ts              # ルーティング統合
│   ├── lib/
│   │   ├── db.ts             # Supabaseクライアント + 型定義
│   │   ├── token.ts          # Magic Linkトークン生成・検証
│   │   └── email.ts          # Resendメール送信
│   ├── app/
│   │   ├── index.tsx         # トップページ
│   │   ├── reserve.tsx       # 予約ページ
│   │   └── mypage.tsx        # クライアントMyPage
│   ├── api/
│   │   ├── search-slot.tsx   # 空きスロット検索（HTMX）
│   │   ├── select-slot.tsx   # スロット選択フォーム表示
│   │   ├── create-reservation.tsx  # 仮予約作成
│   │   └── finalize.tsx      # オプション確定
│   ├── admin/
│   │   ├── index.tsx         # 管理ダッシュボード
│   │   ├── login.tsx         # 管理者ログイン
│   │   ├── middleware.ts     # 認証ガード
│   │   └── slots.tsx         # スロット管理
│   └── components/
│       ├── layout.tsx        # 共通レイアウト + グローバルCSS
│       ├── option-form.tsx   # オプション選択フォーム
│       └── slot-list.tsx     # スロット一覧コンポーネント
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  # 全テーブル + 制約定義
│       └── 002_seed_slots.sql      # 90日分スロット初期データ
├── wrangler.toml
├── tsconfig.json
├── package.json
└── .dev.vars                 # ローカル環境変数（gitignore済み）
```

---

## データベーススキーマ

### テーブル一覧

| テーブル | 用途 |
|---------|------|
| `clients` | 予約者情報（name, email） |
| `available_slots` | 予約可能スロット（start_at, status） |
| `bookings` | 予約レコード（status, token, buffer times等） |
| `booking_options` | セッションオプション（name, quantity, price） |
| `blocked_datetimes` | 臨時休業など |
| `blacklist` | 予約拒否リスト |

全テーブルでRLS（Row Level Security）有効。バックエンドはサービス経由でアクセス。

---

## 環境変数

`.dev.vars`（ローカル）または Cloudflare Dashboard（本番）で設定する。

| 変数名 | 説明 |
|--------|------|
| `SUPABASE_URL` | SupabaseプロジェクトURL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `RESEND_API_KEY` | Resend APIキー |
| `ADMIN_SECRET` | （予備・現在未使用） |
| `MAGIC_LINK_BASE_URL` | Magic LinkのベースURL（例: `https://your-worker.workers.dev`） |
| `TOKEN_EXPIRY_HOURS` | Magic Link有効時間（例: `72`） |

---

## ローカル開発環境の立ち上げ方

### 前提条件

- Node.js 18以上
- npm
- Wrangler CLIがグローバルまたはローカルにインストール済み
- Supabaseプロジェクト作成済み
- Resendアカウント作成済み

### セットアップ手順

```bash
# 1. リポジトリクローン・依存インストール
git clone <repo-url> yoyaku01
cd yoyaku01
npm install

# 2. 環境変数ファイルを作成
cp .dev.vars.example .dev.vars
# .dev.vars を編集して各値を設定

# 3. Supabase マイグレーション適用（Supabase CLI）
supabase db push
# または Supabase Dashboard の SQL Editor に migrations/*.sql を貼り付けて実行

# 4. 管理者ユーザーをSupabaseで作成
# Supabase Dashboard → Authentication → Users → Add user

# 5. 開発サーバー起動
npm run dev
# → http://localhost:8787 でアクセス可能
```

### よく使うコマンド

```bash
npm run dev      # ローカル開発サーバー起動（wrangler dev）
npm run deploy   # Cloudflare Workersへデプロイ（wrangler deploy）
npm run cf-typegen  # Cloudflare Workers型定義を再生成
```

---

## デプロイ

```bash
# Cloudflare Workersへデプロイ
npm run deploy

# 本番環境変数はCloudflare Dashboardで設定
# Workers → Settings → Variables and Secrets
```

Supabase Migrationの本番適用は Supabase Dashboard または `supabase db push --linked` で行う。

---

## APIエンドポイント一覧

### パブリック

| Method | Path | 説明 |
|--------|------|------|
| GET | `/` | トップページ |
| GET | `/reserve` | 予約ページ |
| GET | `/mypage` | クライアントMyPage（`?token=xxx`） |
| GET | `/api/search-slot` | 空きスロット検索（HTMX） |
| POST | `/api/select-slot` | スロット選択フォーム表示 |
| POST | `/api/create-reservation` | 仮予約作成 |
| POST | `/api/finalize` | オプション確定 |

### 管理者（認証必須）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/admin/login` | ログインページ |
| POST | `/admin/login` | ログイン処理 |
| GET | `/admin` | ダッシュボード |
| POST | `/admin/confirm` | 予約承認 + Magic Link送信 |
| POST | `/admin/reject` | 予約却下 |
| POST | `/admin/logout` | ログアウト |
| GET | `/admin/slots` | スロット管理 |
| POST | `/admin/slots/toggle` | 個別スロットのブロック切り替え |
| POST | `/admin/slots/block-day` | 日付一括ブロック |
| POST | `/admin/slots/unblock-day` | 日付一括解除 |
| POST | `/admin/slots/extend` | スロット延伸（+2ヶ月） |
# yoyaku
