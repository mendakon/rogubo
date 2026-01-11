import { config } from 'dotenv';
import { Stream, api as MisskeyApi } from 'misskey-js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

config();

// 「ログボ」のパターンを検出する関数
// 全角・半角、ひらがな・カタカナの組み合わせに対応
function containsLogbo(text: string): boolean {
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

// ユーザーIDごとのログボ回数を記録
interface UserLogboCount {
  userId: string;
  username: string;
  count: number;
}

// CSVファイルからデータを読み込む
async function loadCsvData(
  csvFilePath: string,
  csvDir: string,
  userLogboCounts: Map<string, UserLogboCount>
): Promise<void> {
  try {
    // dataディレクトリが存在しない場合は作成
    if (!existsSync(csvDir)) {
      await mkdir(csvDir, { recursive: true });
    }

    // CSVファイルが存在しない場合は作成（ヘッダーのみ）
    if (!existsSync(csvFilePath)) {
      const header = 'userId,username,count\n';
      await writeFile(csvFilePath, header, 'utf-8');
      console.log('📁 新しいCSVファイルを作成しました');
      return;
    }

    // CSVファイルを読み込む
    const content = await readFile(csvFilePath, 'utf-8');
    const lines = content.trim().split('\n');

    // ヘッダー行をスキップしてデータを読み込む
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [userId, username, countStr] = line.split(',');
      if (userId && username && countStr) {
        const count = parseInt(countStr, 10) || 0;
        userLogboCounts.set(userId, {
          userId,
          username,
          count,
        });
      }
    }

    console.log(`📊 CSVから ${userLogboCounts.size} 件のデータを読み込みました`);
  } catch (error: any) {
    console.error('❌ CSVファイルの読み込みエラー:', error.message);
  }
}

// CSVファイルにデータを保存
async function saveCsvData(
  csvFilePath: string,
  csvDir: string,
  userLogboCounts: Map<string, UserLogboCount>
): Promise<void> {
  try {
    // dataディレクトリが存在しない場合は作成
    if (!existsSync(csvDir)) {
      await mkdir(csvDir, { recursive: true });
    }

    // CSVデータを構築
    const lines: string[] = ['userId,username,count'];

    // Mapを配列に変換してソート（回数の多い順）
    const sortedData = Array.from(userLogboCounts.values())
      .sort((a, b) => b.count - a.count);

    for (const data of sortedData) {
      // カンマや改行を含む場合のエスケープ（シンプルな実装）
      const escapedUsername = data.username.replace(/,/g, '，').replace(/\n/g, ' ');
      lines.push(`${data.userId},${escapedUsername},${data.count}`);
    }

    // CSVファイルに書き込む
    await writeFile(csvFilePath, lines.join('\n') + '\n', 'utf-8');
  } catch (error: any) {
    console.error('❌ CSVファイルの保存エラー:', error.message);
  }
}

// ユーザーのログボ回数を増やす
async function incrementUserLogboCount(
  userId: string,
  username: string,
  userLogboCounts: Map<string, UserLogboCount>,
  csvFilePath: string,
  csvDir: string
): Promise<void> {
  const existing = userLogboCounts.get(userId);

  if (existing) {
    existing.count++;
    existing.username = username; // ユーザー名を更新（変更されている可能性があるため）
  } else {
    userLogboCounts.set(userId, {
      userId,
      username,
      count: 1,
    });
  }

  // CSVファイルに保存
  await saveCsvData(csvFilePath, csvDir, userLogboCounts);

  const count = userLogboCounts.get(userId)?.count || 0;
  console.log(`📈 @${username} のログボ回数: ${count}回`);
}

// メイン関数
async function main(): Promise<void> {
  const INSTANCE_URL = process.env.MISSKEY_INSTANCE_URL || '';
  const API_TOKEN = process.env.MISSKEY_API_TOKEN || '';

  if (!INSTANCE_URL || !API_TOKEN) {
    console.error('環境変数 MISSKEY_INSTANCE_URL と MISSKEY_API_TOKEN を設定してください');
    process.exit(1);
  }

  const api = new MisskeyApi.APIClient({
    origin: INSTANCE_URL,
    credential: API_TOKEN,
  });

  const stream = new Stream(INSTANCE_URL, { token: API_TOKEN });

  // すでにいいねを押した投稿のIDを記録（重複防止）
  const likedNotes = new Set<string>();

  // CSVファイルのパス
  const CSV_FILE_PATH = join(process.cwd(), 'data', 'logbo_counts.csv');
  const CSV_DIR = dirname(CSV_FILE_PATH);

  // ユーザーIDごとのログボ回数を記録
  const userLogboCounts = new Map<string, UserLogboCount>();

  // いいねを押す関数
  async function likeNote(noteId: string, userId: string, username: string): Promise<void> {
    try {
      // すでにいいねを押している場合はスキップ
      if (likedNotes.has(noteId)) {
        return;
      }

      await api.request('notes/reactions/create', {
        noteId: noteId,
        reaction: '👍',
      });

      likedNotes.add(noteId);

      // ユーザーのログボ回数を増やす
      await incrementUserLogboCount(userId, username, userLogboCounts, CSV_FILE_PATH, CSV_DIR);

      console.log(`✅ いいねを押しました: ${noteId}`);
    } catch (error: any) {
      console.error(`❌ いいねに失敗しました: ${noteId}`, error.message);
    }
  }

  console.log('🚀 Misskey LTL監視BOTを開始しました');
  console.log(`📡 インスタンス: ${INSTANCE_URL}`);

  // CSVデータを読み込む
  await loadCsvData(CSV_FILE_PATH, CSV_DIR, userLogboCounts);

  // ローカルタイムラインのストリームを購読
  const localTimelineStream = stream.useChannel('localTimeline');

  localTimelineStream.on('note', async (note) => {
    try {
      // テキストを取得
      const text = note.text || '';

      if (!text) {
        return;
      }

      // 「ログボ」が含まれているかチェック
      if (containsLogbo(text)) {
        const userId = note.userId || '';
        const username = note.user?.username || 'unknown';
        console.log(`📝 検出: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''} (by @${username})`);
        if (userId) {
          await likeNote(note.id, userId, username);
        }
      }
    } catch (error: any) {
      console.error('❌ エラー:', error.message);
    }
  });

  stream.on('_connected_', () => {
    console.log('✅ ストリーム接続完了');
  });

  stream.on('_disconnected_', () => {
    console.log('⚠️ ストリーム切断');
  });

  stream.on('_error_', (error) => {
    console.error('❌ ストリームエラー:', error);
  });

  // エラーハンドリング
  process.on('unhandledRejection', (error) => {
    console.error('未処理のエラー:', error);
  });

  process.on('SIGINT', async () => {
    console.log('\n👋 BOTを終了します');

    // 最後にCSVデータを保存
    await saveCsvData(CSV_FILE_PATH, CSV_DIR, userLogboCounts);

    stream.dispose();
    process.exit(0);
  });
}

// main関数を実行
main().catch((error) => {
  console.error('致命的なエラー:', error);
  process.exit(1);
});

