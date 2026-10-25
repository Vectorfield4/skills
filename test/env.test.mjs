import { describe, expect, it } from "vitest";
import { readEnv } from "../lib/env.mjs";

describe("readEnv", () => {
  it("returns a value from the supplied map", () => {
    expect(readEnv("SITE_TOKEN", { SITE_TOKEN: "abc" }, { os: false })).toBe("abc");
  });

  it("returns undefined for a missing name without touching the OS", () => {
    expect(readEnv("OPENCODE_MISSING_ENV_FOR_TEST", {}, { os: false })).toBeUndefined();
  });

  it("returns undefined when no name is given", () => {
    expect(readEnv("", { A: "1" }, { os: false })).toBeUndefined();
  });
});