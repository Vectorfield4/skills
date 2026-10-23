// Runware image inference over the direct API.
//
// Three places used to copy this request: the favicon script, the logo script
// and the backdrop regenerator. The key is read through `lib/env.mjs`, which also
// sees Windows user and machine variables, so a key set outside the shell works.

import { readEnv } from "./env.mjs";

export const ENDPOINT = "https://api.runware.ai/v1";

export class RunwareError extends Error {}

/** The API key from the environment, or null. */
export function apiKey(env = process.env) {
  return readEnv("RUNWARE_API_KEY", env) ?? readEnv("OPENCODE_RUNWARE_API_KEY", env) ?? null;
}

/** The API key, or a thrown error naming the variable to set. */
export function requireApiKey(env = process.env) {
  const key = apiKey(env);
  if (!key) throw new RunwareError("RUNWARE_API_KEY is not set");
  return key;
}

/**
 * One `imageInference` task. Returns the image URL; throws on an HTTP error, an
 * `errors` payload, or a response without `data[0].imageURL`.
 */
export async function imageInference({
  prompt,
  negativePrompt,
  model,
  width,
  height,
  steps = 25,
  cfgScale = 4,
  seed,
  env = process.env,
  key = requireApiKey(env),
  timeoutMs = 120000,
}) {
  const task = {
    taskType: "imageInference",
    taskUUID: crypto.randomUUID(),
    model,
    positivePrompt: prompt,
    width,
    height,
    steps,
    CFGScale: cfgScale,
  };
  if (negativePrompt) task.negativePrompt = negativePrompt;
  if (seed !== undefined && seed !== null) task.seed = seed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify([task]),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errors) {
      throw new RunwareError(`runware: ${JSON.stringify(payload.errors ?? payload)}`);
    }
    const imageURL = payload.data?.[0]?.imageURL;
    if (!imageURL) throw new RunwareError("runware: no imageURL in the response");
    return imageURL;
  } finally {
    clearTimeout(timer);
  }
}

/** The bytes behind an image URL. */
export async function downloadImage(url, { timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new RunwareError(`download: ${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
