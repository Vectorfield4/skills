// Jev transport: the one place that talks HTTP to the decisions endpoint.
//
// Jev (`typesafe:jev@1`) is served by Runware at `POST /v1/decisions` in the
// TypeSafe request shape (`state` + `questions`). Runware is the only transport:
// this module hardcodes the model and endpoint, and there is no alternative
// backend or SDK path. It is not reachable through the Runware MCP, so every
// skill script imports this module instead. Without RUNWARE_API_KEY the module
// is inert: `hasKey()` is false and callers skip the gate, so CI never touches
// the network.

export const MODEL = "typesafe:jev@1";
export const ENDPOINT = "https://api.runware.ai/v1/decisions";

export class JevError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "JevError";
    this.code = code;
  }
}

const apiKey = () => process.env.RUNWARE_API_KEY ?? "";
export const hasKey = () => apiKey().length > 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One batched decisions request. Retries the transient 429/529 the TypeSafe docs
 * describe with exponential backoff; a key-less environment throws `no-key`
 * before any network call.
 */
export async function askDecisions({ state, questions }) {
  if (!hasKey()) throw new JevError("no-key", "RUNWARE_API_KEY is not set");
  const body = JSON.stringify({ model: MODEL, state, questions });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
        body,
      });
      if (res.status === 429 || res.status === 529) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new JevError("http", `${res.status} ${await res.text()}`);
      return await res.json();
    } catch (error) {
      if (error instanceof JevError) throw error;
      lastError = error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new JevError("http", "decisions request failed");
}
