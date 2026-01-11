import { LTLHandler } from '../types.js';
import { api as MisskeyApi } from 'misskey-js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

// ユーザーIDごとのログボ回数を記録
interface UserLogboCount {
  userId: string;
  username: string;
  count: number;
}

// ログボハンドラー
// 「ログボ」を含む投稿にいいねを押し、CSVに記録する
export class LogboHandler implements LTLHandler {
  public readonly name = 'LogboHandler';

  private api: MisskeyApi.APIClient;
  private likedNotes: Set<string>;
  private userLogboCounts: Map<string, UserLogboCount>;
  private csvFilePath: string;
  private csvDir: string;

  constructor(api: MisskeyApi.APIClient, dataDir: string = 'data') {
    this.api = api;
    this.likedNotes = new Set<string>();
    this.userLogboCounts = new Map<string, UserLogboCount>();
    
    this.csvFilePath = join(process.cwd(), dataDir, 'logbo_counts.csv');
    this.csvDir = dirname(this.csvFilePath);
  }

  // 初期化（CSVデータを読み込む）
  async initialize(): Promise<void> {
    await this.loadCsvData();
  }

  // 終了処理（CSVデータを保存）
  async cleanup(): Promise<void> {
    await this.saveCsvData();
  }

  // ノートを処理
  async handleNote(note: any): Promise<void> {
    const text = note.text || '';
    
    if (!text) {
      return;
    }

    // 「ログボ」が含まれているかチェック
    if (this.containsLogbo(text)) {
      const userId = note.userId || '';
      const username = note.user?.username || 'unknown';
      console.log(`📝 検出: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''} (by @${username})`);
      
      if (userId) {
        await this.likeNote(note.id, userId, username);
      }
    }
  }

  // 「ログボ」のパターンを検出する関数
  private containsLogbo(text: string): boolean {
    // 正規化して検索
    const normalized = text
      .replace(/[ァ-ヶ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
      .replace(/\s+/g, '') // 空白を除去
      .toLowerCase();

    // 「ログボ」のパターン（ひらがな、カタカナ、ローマ字の組み合わせ）
    const patterns = [
      'ろぐぼ',
      'ログボ',
      'ログぼ',
      'ろグボ',
      'ろぐボ',
      'ロぐぼ',
      'ログぼ',
      'logbo',
      'ログボ',
    ];

    return patterns.some(pattern => {
      const normalizedPattern = pattern
        .replace(/[ァ-ヶ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60))
        .replace(/\s+/g, '')
        .toLowerCase();
      return normalized.includes(normalizedPattern);
    });
  }

  // いいねを押す関数
  private async likeNote(noteId: string, userId: string, username: string): Promise<void> {
    try {
      // すでにいいねを押している場合はスキップ
      if (this.likedNotes.has(noteId)) {
        return;
      }

      await this.api.request('notes/reactions/create', {
        noteId: noteId,
        reaction: '👍',
      });

      this.likedNotes.add(noteId);

      // ユーザーのログボ回数を増やす
      await this.incrementUserLogboCount(userId, username);

      console.log(`✅ いいねを押しました: ${noteId}`);
    } catch (error: any) {
      console.error(`❌ いいねに失敗しました: ${noteId}`, error.message);
    }
  }

  // ユーザーのログボ回数を増やす
  private async incrementUserLogboCount(userId: string, username: string): Promise<void> {
    const existing = this.userLogboCounts.get(userId);

    if (existing) {
      existing.count++;
      existing.username = username;
    } else {
      this.userLogboCounts.set(userId, {
        userId,
        username,
        count: 1,
      });
    }

    // CSVファイルに保存
    await this.saveCsvData();

    const count = this.userLogboCounts.get(userId)?.count || 0;
    console.log(`📈 @${username} のログボ回数: ${count}回`);
  }

  // CSVファイルからデータを読み込む
  private async loadCsvData(): Promise<void> {
    try {
      // dataディレクトリが存在しない場合は作成
      if (!existsSync(this.csvDir)) {
        await mkdir(this.csvDir, { recursive: true });
      }

      // CSVファイルが存在しない場合は作成（ヘッダーのみ）
      if (!existsSync(this.csvFilePath)) {
        const header = 'userId,username,count\n';
        await writeFile(this.csvFilePath, header, 'utf-8');
        console.log('📁 新しいCSVファイルを作成しました');
        return;
      }

      // CSVファイルを読み込む
      const content = await readFile(this.csvFilePath, 'utf-8');
      const lines = content.trim().split('\n');

      // ヘッダー行をスキップしてデータを読み込む
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [userId, username, countStr] = line.split(',');
        if (userId && username && countStr) {
          const count = parseInt(countStr, 10) || 0;
          this.userLogboCounts.set(userId, {
            userId,
            username,
            count,
          });
        }
      }

      console.log(`📊 CSVから ${this.userLogboCounts.size} 件のデータを読み込みました`);
    } catch (error: any) {
      console.error('❌ CSVファイルの読み込みエラー:', error.message);
    }
  }

  // CSVファイルにデータを保存
  private async saveCsvData(): Promise<void> {
    try {
      // dataディレクトリが存在しない場合は作成
      if (!existsSync(this.csvDir)) {
        await mkdir(this.csvDir, { recursive: true });
      }

      // CSVデータを構築
      const lines: string[] = ['userId,username,count'];

      // Mapを配列に変換してソート（回数の多い順）
      const sortedData = Array.from(this.userLogboCounts.values())
        .sort((a, b) => b.count - a.count);

      for (const data of sortedData) {
        // カンマや改行を含む場合のエスケープ（シンプルな実装）
        const escapedUsername = data.username.replace(/,/g, '，').replace(/\n/g, ' ');
        lines.push(`${data.userId},${escapedUsername},${data.count}`);
      }

      // CSVファイルに書き込む
      await writeFile(this.csvFilePath, lines.join('\n') + '\n', 'utf-8');
    } catch (error: any) {
      console.error('❌ CSVファイルの保存エラー:', error.message);
    }
  }
}
