// Shared HTTP helper for skill scripts. Native fetch only, no dependencies.

export const DEFAULT_UA = "opencode-skills/1.0";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchText(url, { timeoutMs = 15000, userAgent = DEFAULT_UA } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
