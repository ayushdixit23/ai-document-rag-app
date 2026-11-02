type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

type ApiFailure = {
  success: false;
  message?: string;
  error?: { message?: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init),
  });

  return readApiResponse<T>(response);
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('Invalid server response', response.status);
  }

  if (!response.ok || !isApiSuccess<T>(payload)) {
    const failure = (payload ?? {}) as ApiFailure;
    throw new ApiError(
      failure.error?.message || failure.message || 'Request failed',
      response.status,
    );
  }

  return payload.data;
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'success' in value && (value as { success: unknown }).success === true;
}
