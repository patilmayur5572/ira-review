export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export class TimeoutError extends RetryableError {
  constructor(message = "Request timed out") {
    super(message, 408);
    this.name = "TimeoutError";
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof Error && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true; // network failures

  const status = getStatusCode(error);
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }

  return false;
}

function getStatusCode(error: unknown): number | undefined {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryable(error)) break;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await sleep(jitter);
    }
  }

  throw lastError;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = 30000,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Compose caller's signal with the timeout controller (Node 18 compat)
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort(callerSignal.reason);
    } else {
      const onCallerAbort = () => controller.abort(callerSignal.reason);
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
      controller.signal.addEventListener(
        "abort",
        () => callerSignal.removeEventListener("abort", onCallerAbort),
        { once: true },
      );
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      timedOut
    ) {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract a clean, user-friendly error message from an HTTP API error response body.
 * Handles JSON error objects, HTML pages, and raw text gracefully.
 */
export function parseApiError(status: number, body: string, provider: string): string {
  // Common HTTP status messages
  const statusMessages: Record<number, string> = {
    400: 'Bad request',
    401: 'Authentication failed — check your token or credentials',
    403: 'Access denied — you may not have permission for this resource',
    404: 'Not found — check the URL, project key, or PR number',
    408: 'Request timed out — try again in a moment',
    409: 'Conflict — the resource may have been modified',
    422: 'Invalid request — the server couldn\'t process it',
    429: 'Rate limited — too many requests, try again shortly',
    500: 'Server error — the service is having issues',
    502: 'Bad gateway — the service is temporarily unavailable',
    503: 'Service unavailable — try again in a moment',
    504: 'Gateway timeout — the service took too long to respond',
  };

  const friendlyStatus = statusMessages[status] ?? `HTTP ${status}`;

  // Try to extract a message from JSON response
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const msg = json.message ?? json.error?.message ?? json.error ?? json.errors?.[0]?.message ?? json.detail;
      if (typeof msg === 'string' && msg.length > 0 && msg.length < 200) {
        return `${provider} (${status}): ${msg}`;
      }
    } catch {
      // Not valid JSON — fall through
    }
  }

  // If body is HTML (error page), discard it
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.includes('<body')) {
    return `${provider} (${status}): ${friendlyStatus}`;
  }

  // If body is short enough, use it directly
  if (trimmed.length > 0 && trimmed.length < 150) {
    return `${provider} (${status}): ${trimmed}`;
  }

  // Fallback to friendly status message
  return `${provider} (${status}): ${friendlyStatus}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
