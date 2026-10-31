import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseYaml, parseYamlWithLines, YamlError } from "#lib/yaml/parse.mjs";
import { parseTypeScript, resolveEntry } from "#lib/yaml/typescript.mjs";
import { validateDocument } from "#lib/yaml/validate.mjs";

describe("yaml parser", () => {
  it("round-trips nested mappings, sequences and scalars", () => {
    const text = [
      "title: hello",
      "count: 3",
      "flag: true",
      "empty: null",
      "ratio: 1.5",
      "items:",
      "  - name: one",
      "    value: 1",
      "  - name: two",
      "    value: 2",
      "nested:",
      "  deep: yes please",
    ].join("\n");
    const parsed = parseYaml(text);
    expect(parsed.title).toBe("hello");
    expect(parsed.count).toBe(3);
    expect(parsed.flag).toBe(true);
    expect(parsed.empty).toBeNull();
    expect(parsed.ratio).toBe(1.5);
    expect(parsed.items).toEqual([{ name: "one", value: 1 }, { name: "two", value: 2 }]);
    expect(parsed.nested.deep).toBe("yes please");
  });

  it("reads block scalars with chomping", () => {
    const text = [
      "note: |",
      "  line one",
      "  line two",
      "folded: >",
      "  a b",
      "  c",
      "",
      "  d",
    ].join("\n");
    const parsed = parseYaml(text);
    expect(parsed.note).toBe("line one\nline two\n");
    expect(parsed.folded).toBe("a b c\nd\n");
  });

  it("records line numbers for every key and list item", () => {
    const text = "a: 1\nb:\n  - x: 2\n  - x: 3\nc: 4\n";
    const { value, lines } = parseYamlWithLines(text);
    expect(value.b[1].x).toBe(3);
    expect(lines.get("b")).toBe(2);
    expect(lines.get("b[1]")).toBe(4);
    expect(lines.get("b[1].x")).toBe(4);
    expect(lines.get("c")).toBe(5);
  });

  it("rejects anchors, aliases, tags and flow collections with a line number", () => {
    expect(() => parseYaml("x: &a 1\ny: *a")).toThrow(/line 1|line 2/);
    expect(() => parseYaml("x: [1, 2]")).toThrow(/flow collections/);
    expect(() => parseYaml("x: {a: 1}")).toThrow(/flow collections/);
    expect(() => parseYaml("x: !foo bar")).toThrow(/anchors, aliases and tags/);
  });

  it("rejects tabs in indentation", () => {
    expect(() => parseYaml("x:\n\ty: 1")).toThrow(/tab in indentation/);
  });

  it("rejects merge keys", () => {
    expect(() => parseYaml("x:\n  <<: *a")).toThrow(/merge keys/);
  });

  it("reads stdin-shaped empty documents as null", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("# only a comment\n")).toBeNull();
  });

  it("keeps trailing comments out of values", () => {
    const parsed = parseYaml('name: hello  # a comment\nflag: true # yes');
    expect(parsed.name).toBe("hello");
    expect(parsed.flag).toBe(true);
  });

  it("supports single-quoted and double-quoted escapes", () => {
    const parsed = parseYaml(`a: "line\\nbreak"\nb: 'it''s'`);
    expect(parsed.a).toBe("line\nbreak");
    expect(parsed.b).toBe("it's");
  });
});

describe("type contract reader", () => {
  it("parses interfaces, aliases, docs and refs", () => {
    const source = `
      /** A small contract. */
      export interface Foo {
        /** @question What is your name? @example Ada */
        name: string;
        count?: number | null;
        status: "a" | "b";
        items: string[];
        nested: Bar;
      }

      export type Bar = "x" | "y";
    `;
    const parsed = parseTypeScript(source, { file: "foo.ts" });
    expect([...parsed.types.keys()]).toEqual(["Foo", "Bar"]);
    expect(parsed.types.get("Foo").fields.map((field) => field.name)).toEqual(["name", "count", "status", "items", "nested"]);
    expect(parsed.types.get("Foo").fields[0].doc.question).toBe("What is your name?");
    expect(parsed.types.get("Foo").fields[0].doc.example).toBe("Ada");
    const entry = resolveEntry(parsed, { file: "foo.ts" });
    expect(entry).toBe("Foo");
  });

  it("rejects enums and unsupported generics", () => {
    expect(() => parseTypeScript("export enum Color { Red }", { file: "x.ts" })).toThrow(/enum/);
    expect(() => parseTypeScript("export interface X { y: Partial<Z>; }", { file: "x.ts" })).toThrow(/unsupported type expression/);
  });
});

describe("validator", () => {
  const contract = `
    export interface Foo {
      name: string;
      count?: number | null;
      status: "a" | "b";
      items: string[];
    }
  `;

  it("reports missing required fields and type mismatches", () => {
    const parsed = parseTypeScript(contract, { file: "foo.ts" });
    const entry = resolveEntry(parsed, { file: "foo.ts" });
    const schema = { types: parsed.types, imports: parsed.imports, entry };
    const result = validateDocument({ name: 42, status: "z" }, schema, { strict: false });
    expect(result.ok).toBe(false);
    const messages = result.errors.map((error) => error.message).join(" | ");
    expect(messages).toContain("expected a string");
    expect(messages).toContain('expected one of "a", "b"');
    expect(messages).toContain("missing required field");
  });

  it("treats unknown fields as warnings unless strict", () => {
    const parsed = parseTypeScript(contract, { file: "foo.ts" });
    const entry = resolveEntry(parsed, { file: "foo.ts" });
    const schema = { types: parsed.types, imports: parsed.imports, entry };
    const loose = validateDocument({ name: "ok", status: "a", items: [], extra: 1 }, schema, { strict: false });
    expect(loose.ok).toBe(true);
    expect(loose.warnings.length).toBe(1);
    const strict = validateDocument({ name: "ok", status: "a", items: [], extra: 1 }, schema, { strict: true });
    expect(strict.ok).toBe(false);
  });

  it("computes completeness from filled leaves", () => {
    const parsed = parseTypeScript(contract, { file: "foo.ts" });
    const entry = resolveEntry(parsed, { file: "foo.ts" });
    const schema = { types: parsed.types, imports: parsed.imports, entry };
    const result = validateDocument({ name: "ok", status: "a", items: ["x"], count: null }, schema);
    expect(result.completeness.total).toBe(4);
    expect(result.completeness.filled).toBe(3);
  });
});
