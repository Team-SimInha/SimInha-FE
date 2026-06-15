const RAW_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, '');

export function isBackendConfigured() {
  return Boolean(BACKEND_URL);
}

export function backendUrl(path = '') {
  if (!BACKEND_URL) {
    throw new Error('VITE_BACKEND_URL is not configured');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

export async function apiRequest(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(backendUrl(path), {
    ...options,
    headers,
    credentials: 'omit',
  });

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!res.ok) {
    const message = payload?.error?.message || payload?.message || `API request failed: ${res.status}`;
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) {
      throw new Error(payload.error?.message || payload.error?.code || 'API request failed');
    }
    return payload.data;
  }

  return payload;
}

export function apiGet(path) {
  return apiRequest(path);
}

export function apiPost(path, body) {
  return apiRequest(path, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export function apiPut(path, body) {
  return apiRequest(path, {
    method: 'PUT',
    body: JSON.stringify(body ?? {}),
  });
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' });
}
