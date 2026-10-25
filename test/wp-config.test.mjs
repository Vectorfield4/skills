import { describe, expect, it } from "vitest";
import { resolveWpConfig } from "../lib/wp-config.mjs";

const basic = (pair) => `Basic ${Buffer.from(pair, "utf8").toString("base64")}`;

describe("resolveWpConfig", () => {
  it("reads direct string values", () => {
    const config = resolveWpConfig({
      baseUrl: "https://example.com",
      auth: { type: "basic", user: "admin", password: "secret" },
    });
    expect(config).toEqual({
      baseUrl: "https://example.com",
      authType: "basic",
      authHeader: basic("admin:secret"),
    });
  });

  it("resolves keyName through the environment", () => {
    const config = resolveWpConfig(
      {
        baseUrl: "https://example.com",
        auth: { user: { keyName: "SITE_USER" }, password: { keyName: "SITE_APP_PASSWORD" } },
      },
      { SITE_USER: "editor", SITE_APP_PASSWORD: "abcd efgh" },
    );
    expect(config.authType).toBe("basic");
    expect(config.authHeader).toBe(basic("editor:abcd efgh"));
  });

  it("resolves the env form and a literal value object", () => {
    expect(
      resolveWpConfig(
        {
          baseUrl: { env: "SITE_URL" },
          auth: { user: "admin", password: { value: "literal" } },
        },
        { SITE_URL: "https://example.org" },
      ),
    ).toEqual({
      baseUrl: "https://example.org",
      authType: "basic",
      authHeader: basic("admin:literal"),
    });
  });

  it("accepts the passwordKey shorthand", () => {
    const config = resolveWpConfig(
      {
        baseUrlKey: "SITE_URL",
        auth: { userKey: "SITE_USER", passwordKey: "SITE_APP_PASSWORD" },
      },
      { SITE_URL: "https://example.com", SITE_USER: "admin", SITE_APP_PASSWORD: "pw" },
    );
    expect(config.baseUrl).toBe("https://example.com");
    expect(config.authHeader).toBe(basic("admin:pw"));
  });

  it("reads a bearer token from a key and infers the type", () => {
    const config = resolveWpConfig(
      { baseUrl: "https://example.com", auth: { tokenKey: "SITE_TOKEN" } },
      { SITE_TOKEN: "jwt-value" },
    );
    expect(config).toEqual({
      baseUrl: "https://example.com",
      authType: "bearer",
      authHeader: "Bearer jwt-value",
    });
  });

  it("keeps an explicit bearer type with a direct token", () => {
    expect(
      resolveWpConfig({
        baseUrl: "https://example.com/",
        auth: { type: "bearer", token: "abc" },
      }).authHeader,
    ).toBe("Bearer abc");
  });

  it("throws when the base URL is missing", () => {
    expect(() => resolveWpConfig({ auth: { token: "abc" } })).toThrow(/baseUrl is missing/);
  });

  it("throws when the credentials are missing", () => {
    expect(() => resolveWpConfig({ baseUrl: "https://example.com" })).toThrow(
      /basic auth needs user and password/,
    );
    expect(() =>
      resolveWpConfig({ baseUrl: "https://example.com", auth: { type: "bearer" } }),
    ).toThrow(/bearer auth needs token/);
  });

  it("throws when a named environment variable is unset", () => {
    expect(() =>
      resolveWpConfig(
        { baseUrl: "https://example.com", auth: { tokenKey: "SITE_TOKEN" } },
        { SITE_TOKEN: "" },
      ),
    ).toThrow(/SITE_TOKEN/);
  });

  it("rejects an unknown auth type", () => {
    expect(() =>
      resolveWpConfig({
        baseUrl: "https://example.com",
        auth: { type: "oauth", token: "abc" },
      }),
    ).toThrow(/basic or bearer/);
  });
});
