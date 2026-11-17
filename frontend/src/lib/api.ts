/** Thin fetch wrapper for the Mushafs REST API (JSON, cookie session, typed errors). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

type Json = Record<string, any>;

async function request<T = Json>(method: string, url: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', signal: opts.signal, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Network error');
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401 && url !== '/auth/login' && url !== '/auth/me') {
      window.dispatchEvent(new CustomEvent('mushafs:unauthorized'));
    }
    throw new ApiError(res.status, e.code ?? 'http_error', e.message ?? res.statusText, e.details);
  }
  return data as T;
}

export const api = {
  get: <T = Json>(url: string, signal?: AbortSignal) => request<T>('GET', url, undefined, { signal }),
  post: <T = Json>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T = Json>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T = Json>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T = Json>(url: string) => request<T>('DELETE', url),
};

/** Upload with progress (fetch has no upload progress, so use XHR). */
export function uploadWithProgress(url: string, form: FormData, onProgress: (pct: number) => void): Promise<Json> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code ?? 'upload_failed', data?.error?.message ?? 'Upload failed', data?.error?.details));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error'));
    xhr.send(form);
  });
}
