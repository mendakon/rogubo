import { MisskeyStream } from './misskey-stream.js';
import { MisskeyAPIClient } from './misskey-api.js';

// フォローモニタークラス
// フォローされたら自動的にフォローバックする
export class FollowMonitor {
  private stream: MisskeyStream;
  private api: MisskeyAPIClient;
  private followedUsers: Set<string>; // すでにフォローしたユーザーIDを記録（重複防止）

  constructor(stream: MisskeyStream, api: MisskeyAPIClient) {
    this.stream = stream;
    this.api = api;
    this.followedUsers = new Set<string>();
  }

  // フォロー監視を開始
  async start(): Promise<void> {
    console.log('👥 フォロー監視を開始します');

    // メインチャネルを購読
    const mainChannel = this.stream.useChannel('main');

    // 通知イベントを監視（フォロー通知を検出）
    mainChannel.on('notification', async (notification: any) => {
      try {
        // デバッグ: 通知を受信したことをログに出力
        console.log('🔔 通知を受信しました:', JSON.stringify(notification).substring(0, 200));
        
        // フォロー通知かチェック
        if (notification.type !== 'follow') {
          return;
        }

        const userId = notification.userId || notification.user?.id;
        const username = notification.user?.username || 'unknown';

        if (!userId) {
          return;
        }

        // すでにフォローしたユーザーはスキップ
        if (this.followedUsers.has(userId)) {
          return;
        }

        console.log(`📥 フォローされました: @${username} (${userId})`);

        // フォローバック
        await this.followBack(userId, username);
      } catch (error: any) {
        console.error('❌ フォローイベント処理エラー:', error.message);
      }
    });
  }

  // フォローバック処理
  private async followBack(userId: string, username: string): Promise<void> {
    try {
      await this.api.request('following/create', {
        userId: userId,
      });

      this.followedUsers.add(userId);
      console.log(`✅ フォローバックしました: @${username} (${userId})`);
    } catch (error: any) {
      console.error(`❌ フォローバックに失敗しました: @${username}`, error.message);
    }
  }
}
