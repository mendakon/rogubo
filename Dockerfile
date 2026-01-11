# ビルドステージ
FROM node:20-alpine AS builder

WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー（存在する場合）
COPY package*.json ./
COPY tsconfig.json ./

# 依存関係をインストール（package-lock.jsonがない場合は生成される）
RUN npm install

# ソースコードをコピー
COPY src ./src

# TypeScriptをビルド
RUN npm run build

# 実行ステージ
FROM node:20-alpine

WORKDIR /app

# package.jsonをコピー（実行時に必要）
COPY package.json ./
# package-lock.jsonをbuilderステージからコピー
COPY --from=builder /app/package-lock.json ./

# プロダクション依存関係のみインストール
RUN npm ci --omit=dev

# ビルド済みファイルをコピー
COPY --from=builder /app/dist ./dist

# 環境変数の確認（オプション）
ENV NODE_ENV=production

# アプリケーションを実行
CMD ["node", "dist/index.js"]
