export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!cleanPath.startsWith('/api/')) {
    cleanPath = `/api${cleanPath}`;
  }
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}${cleanPath}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include Bearer Authorization header if token is stored in localStorage
  if (!headers.has('Authorization')) {
    const isAdminEndpoint = cleanPath.includes('/admin');
    const token = isAdminEndpoint
      ? (localStorage.getItem('fest_admin_token') || localStorage.getItem('fest_token'))
      : (localStorage.getItem('fest_token') || localStorage.getItem('fest_admin_token'));
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Always send and receive HTTP-only session cookies
  });

  if (!response.ok) {
    let errorDetail = 'An unexpected error occurred';
    try {
      const errorJson = await response.json();
      if (typeof errorJson.detail === 'string') {
        errorDetail = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        errorDetail = errorJson.detail.map((d: { msg?: string }) => d.msg || 'Validation error').join(', ');
      }
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new ApiError(errorDetail, response.status);
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return {} as T;
}
