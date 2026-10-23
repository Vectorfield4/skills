import { describe, expect, it } from "vitest";

import { parseFlags } from "../lib/cli.mjs";

describe("parseFlags", () => {
  const spec = { apply: "boolean", name: "string", size: "number" };

  it("reads both --flag value and --flag=value", () => {
    expect(parseFlags(["--name", "hellorobot", "--size=512"], spec)).toEqual({
      _: [],
      name: "hellorobot",
      size: 512,
    });
  });

  it("collects positionals and booleans", () => {
    expect(parseFlags(["minor", "--apply"], spec)).toEqual({ _: ["minor"], apply: true });
  });

  it("throws on an unknown flag instead of ignoring it", () => {
    expect(() => parseFlags(["--aply"], spec)).toThrow(/unknown flag/);
  });

  it("throws when a value is missing or not a number", () => {
    expect(() => parseFlags(["--name"], spec)).toThrow(/needs a value/);
    expect(() => parseFlags(["--size", "big"], spec)).toThrow(/must be a number/);
  });
});
