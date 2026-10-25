// Config resolver for the WordPress REST client.
//
// Turns a plain config object into the two things a request needs: a base URL
// and a full Authorization header. Values may be direct strings, or indirections
// that read an environment variable by name, so a caller can commit a config
// file without committing a secret.

import { readEnv } from "./env.mjs";

/** Normalise one resolved value: strings pass through, other primitives stringify. */
function asText(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/**
 * Pull placeholder metadata off an object form.
 * Recognised shapes: { keyName }, { env }, { value }.
 * Returns undefined when the object carries none of them.
 */
function objectSlot(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  if ("value" in source) return { kind: "value", value: source.value };
  if ("keyName" in source) return { kind: "env", value: source.keyName };
  if ("env" in source) return { kind: "env", value: source.env };
  return undefined;
}

/**
 * Resolve a single slot.
 *
 * Precedence: the value shape first, then the sibling `*Key` shorthand.
 * `keyName` and `env` both name an environment variable.
 */
function resolveSlot(source, keyName, env, label) {
  const slot = objectSlot(source);
  if (slot) {
    if (slot.kind === "value") {
      const direct = asText(slot.value);
      if (direct !== undefined) return direct;
      throw new Error(`WordPress config: ${label} has an empty value.`);
    }
    const name = asText(slot.value);
    if (!name) throw new Error(`WordPress config: ${label} names no environment variable.`);
    const fromEnv = readEnv(name, env);
    if (fromEnv === undefined) {
      throw new Error(`WordPress config: environment variable ${name} for ${label} is not set.`);
    }
    return fromEnv;
  }
  if (typeof source === "string" && source.length > 0) return source;

  if (keyName) {
    const name = asText(keyName);
    if (!name) throw new Error(`WordPress config: ${label} key name is empty.`);
    const fromEnv = readEnv(name, env);
    if (fromEnv === undefined) {
      throw new Error(`WordPress config: environment variable ${name} for ${label} is not set.`);
    }
    return fromEnv;
  }
  return undefined;
}

/** Basic auth header payload built from a user and a password. */
function basicHeader(user, password) {
  const pair = `${user}:${password}`;
  return `Basic ${Buffer.from(pair, "utf8").toString("base64")}`;
}

/**
 * Resolve a WordPress config object into a request-ready shape.
 *
 * Supported config:
 *   { baseUrl, baseUrlKey, auth: { type, user, userKey, password, passwordKey, token, tokenKey } }
 * where each credential may be a direct string or { keyName }, { env }, { value }.
 * Auth type is inferred: bearer when a token is present, otherwise basic.
 *
 * @param {object} [config]
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ baseUrl: string, authType: "basic"|"bearer", authHeader: string }}
 */
export function resolveWpConfig(config = {}, env = process.env) {
  const source = config && typeof config === "object" ? config : {};
  const auth = source.auth && typeof source.auth === "object" ? source.auth : {};

  const baseUrl = resolveSlot(source.baseUrl, source.baseUrlKey, env, "baseUrl");
  if (!baseUrl) {
    throw new Error("WordPress config: baseUrl is missing. Set baseUrl or baseUrlKey.");
  }

  const token = resolveSlot(auth.token, auth.tokenKey, env, "auth token");
  const user = resolveSlot(auth.user, auth.userKey, env, "auth user");
  const password = resolveSlot(auth.password, auth.passwordKey, env, "auth password");

  const declared = typeof auth.type === "string" ? auth.type.toLowerCase() : undefined;
  if (declared && declared !== "basic" && declared !== "bearer") {
    throw new Error(`WordPress config: auth.type must be basic or bearer, got ${auth.type}.`);
  }
  const authType = declared ?? (token ? "bearer" : "basic");

  if (authType === "bearer") {
    if (!token) {
      throw new Error("WordPress config: bearer auth needs token or tokenKey.");
    }
    return { baseUrl, authType, authHeader: `Bearer ${token}` };
  }

  if (!user || !password) {
    const missing = !user && !password ? "user and password" : !user ? "user" : "password";
    throw new Error(
      `WordPress config: basic auth needs ${missing}. Set it directly, by key, or use bearer auth.`,
    );
  }
  return { baseUrl, authType, authHeader: basicHeader(user, password) };
}
