# Misskey ログボいいねBOT

Misskeyのローカルタイムライン（LTL）を監視して、「ログボ」（一部がひらがなになっても可）と呟いた人に自動的にいいねを押すBOTです。

## 機能

- ローカルタイムラインをリアルタイムで監視
- 「ログボ」「ろぐぼ」「ログぼ」などのパターンを検出（ひらがな・カタカナ混在に対応）
- マッチする投稿に自動的に👍を付ける
- 重複防止（同じ投稿に2回いいねしない）
- **ユーザーIDとログボ回数をCSVファイルに記録**（`data/logbo_counts.csv`）

## セットアップ

### 環境変数の設定

`.env`ファイルを作成し、以下の環境変数を設定してください：

```
MISSKEY_INSTANCE_URL=https://your-misskey-instance.com
MISSKEY_API_TOKEN=your_access_token_here
```

**テンプレートファイル**: `env.example`ファイルを参考にして、`.env`ファイルを作成することもできます：

```bash
cp env.example .env
# .envファイルを編集して値を設定
```

#### アクセストークンの取得方法

1. Misskeyインスタンスにログイン
2. 設定 > API > アクセストークンの発行
3. 以下の権限を有効にする：
   - ノートの閲覧
   - リアクションの作成
   - フォロー
   - 通知の閲覧
4. 生成されたトークンをコピーして`.env`ファイルに貼り付け

### Dockerを使用する場合（推奨）

#### 1. Docker Composeを使用

```bash
docker-compose up -d
```

ログを確認：

```bash
docker-compose logs -f
```

停止：

```bash
docker-compose down
```

#### 2. Dockerコマンドを直接使用

```bash
# イメージをビルド
docker build -t misskey-logbo-bot .

# コンテナを実行
docker run -d \
  --name misskey-logbo-bot \
  --restart unless-stopped \
  --env-file .env \
  misskey-logbo-bot

# ログを確認
docker logs -f misskey-logbo-bot

# 停止
docker stop misskey-logbo-bot
```

### ローカルで実行する場合

#### 1. 依存関係のインストール

```bash
npm install
```

#### 2. ビルド

```bash
npm run build
```

#### 3. 実行

```bash
npm start
```

開発モード（ファイル変更を自動検知）：

```bash
npm run dev
```

## 使用方法

BOTを起動すると、自動的にローカルタイムラインを監視し始めます。「ログボ」が含まれる投稿を検出すると、自動的にいいねを押します。

終了するには `Ctrl+C` を押してください。

## データ保存

BOTは`data/logbo_counts.csv`ファイルにユーザーIDとログボ回数を記録します。

CSVファイルの形式：
```
userId,username,count
userid1,username1,5
userid2,username2,3
...
```

- 起動時に既存のCSVデータを読み込みます
- いいねを押すたびにユーザーのログボ回数が増加します
- ログボ回数の多い順にソートして保存されます
- BOT終了時（`Ctrl+C`）に自動保存されます

## 検出パターン

以下のパターンが検出されます（大文字小文字、全角半角、ひらがなカタカナの組み合わせに対応）：

- ログボ
- ろぐぼ
- ログぼ
- ろグボ
- ろぐボ
- ロぐぼ
- logbo（ローマ字）

## 注意事項

- このBOTはMisskeyのAPIレートリミットを遵守するよう設計されていますが、過度な使用は避けてください
- サーバーへの負荷を考慮し、適切に運用してください
- BOTアカウントのプロフィールに、BOTである旨を明記することを推奨します

## ライセンス

MIT

