const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.SMOKE_API_KEY || process.env.API_KEY;

export async function http(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined)
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

export async function httpJson<T>(path: string, init?: RequestInit): Promise<{ res: Response; json: T }> {
  const res = await http(path, init);
  const json = (await res.json()) as T;
  return { res, json };
}

