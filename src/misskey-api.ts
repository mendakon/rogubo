// Misskey HTTP APIクライアント
export class MisskeyAPIClient {
  private origin: string;
  private token: string;

  constructor(origin: string, token: string) {
    this.origin = origin.replace(/\/$/, '');
    this.token = token;
  }

  async request<T = any>(endpoint: string, body: Record<string, any> = {}): Promise<T> {
    const url = `${this.origin}/api/${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        i: this.token,
        ...body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // レスポンスが空の場合（204 No Contentなど）は空オブジェクトを返す
    const contentType = response.headers.get('content-type');
    if (response.status === 204 || !contentType?.includes('application/json')) {
      return {} as T;
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (error: any) {
      throw new Error(`JSON parse error: ${error.message} - Response: ${text.substring(0, 200)}`);
    }
    
    // エラーレスポンスのチェック
    if (data?.error) {
      throw new Error(`API error: ${data.error?.message || JSON.stringify(data.error)}`);
    }

    return data as T;
  }
}