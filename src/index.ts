import { config } from 'dotenv';
import { MisskeyAPIClient } from './misskey-api.js';
import { MisskeyStream } from './misskey-stream.js';
import { LTLMonitor } from './ltl-monitor.js';
import { LogboHandler } from './handlers/logbo-handler.js';
import { FollowMonitor } from './follow-monitor.js';

config();

// メイン関数
async function main(): Promise<void> {
  const INSTANCE_URL = process.env.MISSKEY_INSTANCE_URL || '';
  const API_TOKEN = process.env.MISSKEY_API_TOKEN || '';

  if (!INSTANCE_URL || !API_TOKEN) {
    console.error('環境変数 MISSKEY_INSTANCE_URL と MISSKEY_API_TOKEN を設定してください');
    process.exit(1);
  }

  const api = new MisskeyAPIClient(INSTANCE_URL, API_TOKEN);
  const stream = new MisskeyStream(INSTANCE_URL, API_TOKEN);

  console.log('🚀 Misskey LTL監視BOTを開始しました');
  console.log(`📡 インスタンス: ${INSTANCE_URL}`);

  // 自分のアカウント情報を取得してログに出力
  try {
    const account = await api.request('i') as any;
    if (!account) {
      console.error('❌ アカウント情報が取得できませんでした');
    } else {
      const username = account.username || account.usernameHost || 'unknown';
      const displayName = account.name || username;
      const userId = account.id || 'unknown';
      console.log(`👤 接続アカウント: @${username}${displayName !== username ? ` (${displayName})` : ''} (${userId})`);
    }
  } catch (error: any) {
    console.error('❌ アカウント情報の取得に失敗しました:', error?.message || error);
  }

  // LTLモニターを作成
  const monitor = new LTLMonitor(stream);

  // ハンドラーを作成・登録
  // 将来的に別のハンドラー（例: OtherWordHandler）を追加する場合は、ここに登録する
  const logboHandler = new LogboHandler(api);
  await logboHandler.initialize();
  monitor.registerHandler(logboHandler);

  // 将来的に他のハンドラーを追加する例:
  // const otherWordHandler = new OtherWordHandler(api, { word: '別の単語' });
  // await otherWordHandler.initialize();
  // monitor.registerHandler(otherWordHandler);

  // LTL監視を開始
  await monitor.start();

  // フォローモニターを作成・開始
  const followMonitor = new FollowMonitor(stream, api);
  await followMonitor.start();

  // エラーハンドリング
  process.on('unhandledRejection', (error) => {
    console.error('未処理のエラー:', error);
  });

  process.on('SIGINT', async () => {
    console.log('\n👋 BOTを終了します');

    // 各ハンドラーのクリーンアップ処理を実行
    // 将来的に複数のハンドラーがある場合に備えて、配列で管理することも可能
    await logboHandler.cleanup();

    monitor.dispose();
    process.exit(0);
  });
}

// main関数を実行
main().catch((error) => {
  console.error('致命的なエラー:', error);
  process.exit(1);
});
