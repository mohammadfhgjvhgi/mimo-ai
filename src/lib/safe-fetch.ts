// ===================================================================
// MiMo AI — Safe Fetch Helper
// ===================================================================
// Handles cases where server is down or returns HTML instead of JSON.
// Prevents "Unexpected token '<'" errors.
// ===================================================================

export class ApiError extends Error {
  status: number;
  isServerDown: boolean;

  constructor(message: string, status: number = 0, isServerDown: boolean = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isServerDown = isServerDown;
  }
}

/**
 * Safe JSON fetch — handles HTML responses, network errors, and server down.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (err) {
    // Network error — server down or unreachable
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ApiError(
      `Cannot connect to server. Make sure dev server is running (bun run dev). ${msg}`,
      0,
      true
    );
  }

  // Check if response is HTML (server down or 404 page)
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    // Try to get error message
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        const msg = (data as { error?: string }).error ?? `HTTP ${response.status}`;
        throw new ApiError(msg, response.status);
      } catch {
        // JSON parse failed
      }
    }
    throw new ApiError(`HTTP ${response.status}`, response.status);
  }

  // Check content type before parsing JSON
  if (!contentType.includes("application/json")) {
    // Server returned HTML — likely the dev server is down and a proxy
    // returned an HTML error page
    throw new ApiError(
      "Server returned HTML instead of JSON. The dev server may be down. Run 'bun run dev' to start it.",
      response.status,
      true
    );
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "JSON parse failed";
    throw new ApiError(`Invalid JSON response: ${msg}`, response.status);
  }
}

/**
 * Check if the server is alive by hitting a simple endpoint.
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch("/api/state", { method: "GET" });
    return response.ok && (response.headers.get("content-type") ?? "").includes("application/json");
  } catch {
    return false;
  }
}
