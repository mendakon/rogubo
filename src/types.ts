// LTLハンドラーのインターフェース
// 将来的に別の機能（別の単語検出など）を追加する際に実装する
export interface LTLHandler {
  // ハンドラーの名前（ログ用）
  name: string;

  // ノートを処理する
  // 返り値は非同期処理の完了を待つ必要があるかどうかを示す
  handleNote(note: any): Promise<void>; // TODO: misskey-jsの型定義を確認して適切な型に変更
}
