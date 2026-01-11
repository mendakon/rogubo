import WebSocket from 'ws';
import { EventEmitter } from 'events';

// チャンネルハンドラー
export class ChannelHandler extends EventEmitter {
  private channel: string;
  private id: string;

  constructor(channel: string, id: string) {
    super();
    this.channel = channel;
    this.id = id;
  }

  getChannelName(): string {
    return this.channel;
  }

  getId(): string {
    return this.id;
  }
}

// Misskey WebSocketストリーム
export class MisskeyStream extends EventEmitter {
  private instanceUrl: string;
  private token: string;
  private ws: WebSocket | null = null;
  private channels: Map<string, ChannelHandler> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 3000;
  private isConnecting = false;
  private isClosed = false;

  constructor(instanceUrl: string, token: string) {
    super();
    // URLをWebSocket URLに変換（https:// -> wss://, http:// -> ws://）
    let wsUrl = instanceUrl.replace(/\/$/, '');
    wsUrl = wsUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    if (!wsUrl.startsWith('wss://') && !wsUrl.startsWith('ws://')) {
      wsUrl = 'wss://' + wsUrl;
    }
    this.instanceUrl = wsUrl;
    this.token = token;
  }

  // WebSocket接続を開始
  async connect(): Promise<void> {
    if (this.isClosed) {
      throw new Error('Stream is closed');
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = `${this.instanceUrl}/streaming?i=${encodeURIComponent(this.token)}`;
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        this.isConnecting = false;
        this.emit('_connected_');
        console.log('✅ WebSocket接続完了');

        // 既存のチャンネルを再購読
        for (const handler of this.channels.values()) {
          this.subscribeChannel(handler.getChannelName(), handler.getId());
        }
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString());
          // すべてのメッセージをログに出力
          console.log('📨 受信メッセージ:', JSON.stringify(message, null, 2));
          this.handleMessage(message);
        } catch (error: any) {
          console.error('❌ メッセージパースエラー:', error.message);
          console.error('❌ 生データ:', data.toString());
        }
      });

      ws.on('error', (error) => {
        this.isConnecting = false;
        console.error('❌ WebSocketエラー:', error);
      });

      ws.on('close', () => {
        this.isConnecting = false;
        this.ws = null;
        this.emit('_disconnected_');
        console.log('⚠️ WebSocket切断');

        // 自動再接続（閉じられていない場合）
        if (!this.isClosed) {
          this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
              console.error('❌ 再接続エラー:', error);
            });
          }, this.reconnectDelay);
        }
      });

      this.ws = ws;
    } catch (error: any) {
      this.isConnecting = false;
      throw error;
    }
  }

  // メッセージを処理
  private handleMessage(message: any): void {
    if (message.type === 'channel') {
      const body = message.body;
      const channelId = body.id;
      const eventType = body.type; // 'note', 'notification' など

      console.log(`📬 チャンネルメッセージ: channelId=${channelId}, eventType=${eventType}`);
      console.log(`📦 ボディ内容:`, JSON.stringify(body.body, null, 2));

      // チャンネルIDでハンドラーを検索
      const handler = Array.from(this.channels.values()).find(h => h.getId() === channelId);
      if (handler) {
        console.log(`✅ ハンドラー見つかりました: ${handler.getChannelName()} (ID: ${channelId})`);
        // イベントタイプでイベントを発火
        handler.emit(eventType, body.body);
      } else {
        // デバッグ: ハンドラーが見つからない場合
        console.log(`⚠️ チャンネルID ${channelId} のハンドラーが見つかりません。登録済みチャンネル:`, Array.from(this.channels.values()).map(h => h.getChannelName() + ':' + h.getId()));
      }
    } else if (message.type !== 'ping' && message.type !== 'pong') {
      // ping/pong以外のメッセージもログに出力
      console.log(`📋 その他のメッセージタイプ: ${message.type}`, JSON.stringify(message, null, 2));
    }
  }

  // チャンネルを購読
  useChannel(channel: string): ChannelHandler {
    // 既存のハンドラーを検索（同じチャンネル名の場合）
    const existingHandler = Array.from(this.channels.values()).find(h => h.getChannelName() === channel);
    if (existingHandler) {
      return existingHandler;
    }

    // 新しいハンドラーを作成
    const id = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const handler = new ChannelHandler(channel, id);
    this.channels.set(id, handler);

    // 既に接続されている場合は購読
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribeChannel(channel, id);
    } else {
      // 接続されていない場合は接続を開始
      this.connect().catch((error) => {
        console.error('❌ 接続エラー:', error);
      });
    }

    return handler;
  }

  // チャンネル購読メッセージを送信
  private subscribeChannel(channel: string, id: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: 'connect',
      body: {
        channel: channel,
        id: id,
      },
    };

    console.log(`📡 チャンネル購読: ${channel} (ID: ${id})`);
    this.ws.send(JSON.stringify(message));
  }

  // WebSocket接続を閉じる
  close(): void {
    this.isClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.channels.clear();
  }
}