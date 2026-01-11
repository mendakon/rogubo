import { MisskeyStream } from './misskey-stream.js';
import { LTLHandler } from './types.js';

// LTL監視クラス
// 複数のハンドラーを登録して、LTLの投稿を各ハンドラーに配信する
export class LTLMonitor {
  private stream: MisskeyStream;
  private handlers: LTLHandler[] = [];

  constructor(stream: MisskeyStream) {
    this.stream = stream;
  }

  // ハンドラーを登録
  registerHandler(handler: LTLHandler): void {
    this.handlers.push(handler);
    console.log(`📝 ハンドラーを登録しました: ${handler.name}`);
  }

  // 複数のハンドラーを一度に登録
  registerHandlers(handlers: LTLHandler[]): void {
    handlers.forEach(handler => this.registerHandler(handler));
  }

  // LTL監視を開始
  async start(): Promise<void> {
    console.log('🚀 LTL監視を開始します');
    console.log(`📡 登録されたハンドラー数: ${this.handlers.length}`);

    // ホームタイムラインのストリームを購読
    const homeTimelineStream = this.stream.useChannel('homeTimeline');

    homeTimelineStream.on('note', async (note) => {
      try {
        // テキストがない場合はスキップ
        if (!note.text) {
          return;
        }

        // 各ハンドラーにノートを配信
        for (const handler of this.handlers) {
          try {
            await handler.handleNote(note);
          } catch (error: any) {
            console.error(`❌ ハンドラー「${handler.name}」でエラー:`, error.message);
          }
        }
      } catch (error: any) {
        console.error('❌ ノート処理エラー:', error.message);
      }
    });

    this.stream.on('_connected_', () => {
      console.log('✅ ストリーム接続完了');
    });

    this.stream.on('_disconnected_', () => {
      console.log('⚠️ ストリーム切断');
    });
  }

  // ストリームを切断
  dispose(): void {
    this.stream.close();
  }
}
