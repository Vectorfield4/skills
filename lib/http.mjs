// Shared HTTP helper for skill scripts. Native fetch only, no dependencies.

export const DEFAULT_UA = "opencode-skills/1.0";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";

/**
 * Fetches a URL as text. `method`/`body` cover JSON endpoints that only answer
 * a form-encoded POST; without a body the request stays a plain GET.
 */
export async function fetchText(
  url,
  { timeoutMs = 15000, userAgent = DEFAULT_UA, method = "GET", body = null, headers = {} } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const hasBody = method !== "GET" && body !== null && body !== undefined;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent,
        ...(hasBody ? { "Content-Type": FORM_CONTENT_TYPE } : {}),
        ...headers,
      },
      ...(hasBody ? { body } : {}),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
