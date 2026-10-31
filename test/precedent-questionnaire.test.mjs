import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

import { parseYaml } from "#lib/yaml/parse.mjs";
import { parseTypeScript, resolveEntry } from "#lib/yaml/typescript.mjs";
import { validateDocument } from "#lib/yaml/validate.mjs";

const SKILLS_ROOT = resolve(process.cwd());
const GENERATOR = join(SKILLS_ROOT, "skills/content/precedent-interview/scripts/questionnaire.mjs");
const CHECKER = join(SKILLS_ROOT, "skills/content/precedent-interview/scripts/check-answers.mjs");
const BULK = join(SKILLS_ROOT, "skills/content/precedent-interview/scripts/bulk-questions.mjs");
const ENSURE = join(SKILLS_ROOT, "skills/content/precedent-interview/scripts/ensure-questionnaire.mjs");
const APPLY = join(SKILLS_ROOT, "skills/content/precedent-interview/scripts/apply-answers.mjs");
const CONTRACT = join(SKILLS_ROOT, "lib/content/precedent-questionnaire.ts");
const EXAMPLE = join(SKILLS_ROOT, "skills/content/precedent-interview/references/example-filled.yaml");

describe("precedent questionnaire generator", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "precedent-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a valid skeleton that the contract accepts", () => {
    const out = join(dir, "q.yaml");
    const result = spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(0);
    const text = readFileSync(out, "utf8");
    const value = parseYaml(text);
    expect(value.slug).toBe("test-case");
    expect(value.schemaVersion).toBe("1.0");

    const source = readFileSync(CONTRACT, "utf8");
    const parsed = parseTypeScript(source, { file: CONTRACT });
    const entry = resolveEntry(parsed, { file: CONTRACT });
    const schema = { types: parsed.types, imports: parsed.imports, entry };
    const validation = validateDocument(value, schema, { strict: false });
    expect(validation.errors).toEqual([]);
  });

  it("refuses to overwrite a filled file without --force", () => {
    const out = join(dir, "q.yaml");
    spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    const second = spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/refusing to overwrite/);
  });

  it("overwrites with --force", () => {
    const out = join(dir, "q.yaml");
    spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    const second = spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`, "--force"], { cwd: dir, encoding: "utf8" });
    expect(second.status).toBe(0);
  });

  it("also emits a markdown copy with --format both", () => {
    const out = join(dir, "q.yaml");
    const result = spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`, "--format=both"], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(existsSync(out.replace(/\.yaml$/, ".md"))).toBe(true);
  });
});

describe("precedent gate", () => {
  it("blocks an empty skeleton", () => {
    const dir = mkdtempSync(join(tmpdir(), "precedent-"));
    const out = join(dir, "empty.yaml");
    spawnSync(process.execPath, [GENERATOR, "--slug=empty-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    const result = spawnSync(process.execPath, [CHECKER, `--answers=${out}`], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.blocking.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes the filled example", () => {
    const result = spawnSync(process.execPath, [CHECKER, `--answers=${EXAMPLE}`], { cwd: SKILLS_ROOT, encoding: "utf8" });
    const report = JSON.parse(result.stdout);
    expect(report.blocking).toEqual([]);
    expect(result.status).toBe(0);
  });
});

describe("bulk questions", () => {
  it("collects empty fields and returns total > 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "precedent-"));
    const out = join(dir, "q.yaml");
    spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    const result = spawnSync(process.execPath, [BULK, `--file=${out}`], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.done).toBe(false);
    expect(report.total).toBeGreaterThan(0);
    expect(Array.isArray(report.questions)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns done when all required fields are filled", () => {
    const result = spawnSync(process.execPath, [BULK, `--file=${EXAMPLE}`], { cwd: SKILLS_ROOT, encoding: "utf8" });
    const report = JSON.parse(result.stdout);
    expect(report.done).toBe(true);
    expect(result.status).toBe(1);
  });
});

describe("apply answers", () => {
  it("writes multiple values at once and preserves comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "precedent-"));
    const out = join(dir, "q.yaml");
    spawnSync(process.execPath, [GENERATOR, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    const answersPath = join(dir, "answers.json");
    writeFileSync(answersPath, JSON.stringify({ "workingTitle": "Test Title", "client.industry": "IT" }));
    const result = spawnSync(process.execPath, [APPLY, `--file=${out}`, `--answers=${answersPath}`], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toContain('workingTitle: "Test Title"');
    expect(text).toContain('industry: "IT"');
    expect(text).toContain("#");  // comments preserved
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("ensure questionnaire", () => {
  it("generates template when file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "precedent-"));
    const out = join(dir, "missing.yaml");
    const result = spawnSync(process.execPath, [ENSURE, "--slug=test-case", `--out=${out}`], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(existsSync(out)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 0 when file is filled", () => {
    const result = spawnSync(process.execPath, [ENSURE, "--slug=cv-acceptance-control", `--out=${EXAMPLE}`], { cwd: SKILLS_ROOT, encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});