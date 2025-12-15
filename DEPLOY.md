# デプロイ手順書（完全無料）

このアプリケーションをVercel + Supabaseで完全無料デプロイする手順です。

## 必要なアカウント

1. **GitHub** - コードのホスティング
2. **Vercel** - フロントエンド + バックエンドAPI
3. **Supabase** - PostgreSQLデータベース

---

## 1. Supabaseのセットアップ

### 1-1. Supabaseアカウント作成
1. https://supabase.com/ にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ

### 1-2. プロジェクト作成
1. 「New Project」をクリック
2. 以下を入力：
   - **Name**: `task-manager`（任意）
   - **Database Password**: 強力なパスワードを設定（保存必須）
   - **Region**: `Northeast Asia (Tokyo)`
   - **Pricing Plan**: `Free`
3. 「Create new project」をクリック（数分待つ）

### 1-3. データベース接続情報取得

**方法1（推奨）:**
1. 左サイドバーの「Database」をクリック
2. 右上の「Connect」ボタンをクリック
3. 「Connection string」タブを選択
4. モードを「URI」に切り替え
5. 表示された接続文字列をコピー
   - 形式: `postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
   - `[YOUR-PASSWORD]` 部分を、1-2で設定したパスワードに置き換える

**方法2:**
1. 左サイドバー下部の「Project Settings」（歯車アイコン）をクリック
2. 「Database」タブをクリック
3. 下にスクロールして「Connection string」セクションを探す
4. モードを「URI」に選択
5. パスワード部分を実際のパスワードに置き換える

### 1-4. データベースマイグレーション
ローカルで以下を実行：

```bash
cd backend

# .envファイル作成（DATABASE_URLをSupabaseのURIに設定）
# 注意：YOUR-PASSWORDを実際のパスワードに、xxxを実際の値に置き換えてください
cat > .env << 'ENVEOF'
DATABASE_URL="postgresql://postgres.xxx:YOUR-PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3001
ENVEOF

# Prismaマイグレーション実行
npx prisma db push

# 確認（Prisma Studioでデータベース構造確認）
npx prisma studio
```

---

## 2. GitHubリポジトリ作成

### 2-1. ローカルでGit初期化
```bash
cd /Users/shigemorishinji/Programming/claudecode/task

# Gitリポジトリ初期化（まだの場合）
git init

# .gitignoreファイル作成
cat > .gitignore << 'GITEOF'
# Dependencies
node_modules/
backend/node_modules/
frontend/node_modules/

# Environment variables
.env
.env.local
backend/.env
frontend/.env

# Build outputs
dist/
backend/dist/
frontend/dist/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Prisma
backend/prisma/migrations/
GITEOF

# ファイルをステージング
git add .
git commit -m "Initial commit: Task Manager Application"
```

### 2-2. GitHubリポジトリ作成
1. https://github.com/new にアクセス
2. リポジトリ名: `task-manager`（任意）
3. プライベート/パブリック選択
4. 「Create repository」をクリック

### 2-3. リモートリポジトリにプッシュ
```bash
# GitHubのリポジトリURLを設定
git remote add origin https://github.com/YOUR-USERNAME/task-manager.git

# プッシュ
git branch -M main
git push -u origin main
```

---

## 3. Vercelデプロイ

### 3-1. Vercelアカウント作成
1. https://vercel.com/ にアクセス
2. 「Start Deploying」をクリック
3. GitHubアカウントでサインアップ

### 3-2. プロジェクトインポート
1. Vercelダッシュボードで「Add New...」→「Project」
2. GitHubリポジトリ `task-manager` を選択
3. 「Import」をクリック

### 3-3. ビルド設定
以下を設定：

- **Framework Preset**: `Vite`
- **Root Directory**: `./`
- **Build Command**: `npm run vercel-build`
- **Output Directory**: `frontend/dist`

### 3-4. 環境変数設定
「Environment Variables」セクションで以下を追加：

| Name | Value |
|------|-------|
| `DATABASE_URL` | Supabaseの接続URI |
| `JWT_SECRET` | ランダムな文字列（32文字以上推奨） |
| `VITE_API_URL` | 空欄（後で設定） |

「Deploy」をクリック

### 3-5. デプロイ完了後
1. デプロイ完了を待つ（5-10分）
2. デプロイされたURLをコピー（例: `https://task-manager-xxx.vercel.app`）
3. 「Settings」→「Environment Variables」で `VITE_API_URL` を追加：
   - **Value**: デプロイされたURL（例: `https://task-manager-xxx.vercel.app`）
4. 「Deployments」→最新デプロイの「...」→「Redeploy」で再デプロイ

---

## 4. 動作確認

1. デプロイされたURLにアクセス
2. ユーザー登録画面が表示されることを確認
3. 新規ユーザーを登録してログイン
4. タスク管理機能が正常に動作することを確認

---

## トラブルシューティング

### API接続エラー
- ブラウザの開発者ツールでAPI URLを確認
- `VITE_API_URL` が正しく設定されているか確認
- Vercelで再デプロイ

### データベース接続エラー
- Supabaseの `DATABASE_URL` が正しいか確認
- パスワードに特殊文字がある場合はURLエンコード必要
- Supabaseプロジェクトがアクティブか確認

### ビルドエラー
- Vercelのビルドログを確認
- ローカルで `npm run build` が成功するか確認
- 依存関係のバージョン互換性を確認

---

## 費用

**完全無料**（以下の無料枠内で利用）

- **Vercel**: 
  - 100GB帯域/月
  - Serverless実行時間 100時間/月
  
- **Supabase**:
  - 500MBストレージ
  - 2GB転送/月
  - 無制限API リクエスト

個人利用なら十分な範囲です。

---

## 今後のアップデート

コードを更新した場合：

```bash
git add .
git commit -m "Update: 変更内容"
git push origin main
```

GitHubにプッシュすると、Vercelが自動的に再デプロイします。
