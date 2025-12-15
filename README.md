# 月次タスク管理システム

月ごとのタスクをカレンダー形式で管理できるWebアプリケーションです。

## 機能

- ✅ タスクの追加・編集・削除
- 📅 月ごとのカレンダー表示
- ✔️ 日別の完了チェック
- ➡️ 未完了タスクの翌月繰越
- 💾 タスクテンプレートの保存・適用
- 🔐 ユーザー認証

## 技術スタック

### フロントエンド
- React + TypeScript
- Vite
- Tailwind CSS v4

### バックエンド
- Node.js + Express
- Prisma ORM
- PostgreSQL
- JWT認証

## ローカル開発

### 1. 環境変数設定

```bash
# バックエンド
cd backend
cp .env.example .env
# .envファイルを編集してDATABASE_URLとJWT_SECRETを設定

# フロントエンド
cd frontend
cp .env.example .env
# デフォルトでlocalhost:3001を使用
```

### 2. データベースセットアップ

```bash
cd backend
npm install
npx prisma db push
```

### 3. 起動

```bash
# バックエンド（別ターミナル）
cd backend
npm run dev

# フロントエンド（別ターミナル）
cd frontend
npm run dev
```

ブラウザで http://localhost:5173 を開く

## デプロイ

完全無料でVercel + Supabaseにデプロイ可能です。

詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

## ライセンス

MIT
