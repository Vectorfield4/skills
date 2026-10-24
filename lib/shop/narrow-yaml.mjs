// Narrow YAML codec for shop data files (`data/<host>/*.yaml`).
//
// The schema is deliberately small and validated line by line:
//
//   host: hello-robot.ru
//   updated_at: "2026-10-24T09:12:00Z"
//   items:
//     - name: Unitree
//       domain: unitree.com
//
// Top-level scalars, one `<section>:` list, items as `- key: value` blocks with
// scalar values only. Anything else stops the run with a line number instead of
// being silently dropped. Keys are sorted on write, so a re-run is byte-stable.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SCALAR = /^-?\d+(?:\.\d+)?$/;

function parseScalar(raw) {
  const text = String(raw ?? "").trim();
  if (text === "null" || text === "") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (SCALAR.test(text)) return Number(text);
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return text;
}

function splitPair(line, lineNumber, indent) {
  const prefix = " ".repeat(indent);
  if (!line.startsWith(prefix)) throw new Error(`line ${lineNumber}: expected ${indent} spaces`);
  const body = line.slice(indent);
  if (body.startsWith("- ")) throw new Error(`line ${lineNumber}: unexpected list item`);
  const at = body.indexOf(": ");
  const key = at === -1 ? body.replace(/:$/, "") : body.slice(0, at);
  if (!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key)) {
    throw new Error(`line ${lineNumber}: bad key "${key}"`);
  }
  return { key, value: at === -1 ? null : parseScalar(body.slice(at + 2)) };
}

/**
 * Parses the narrow document. Returns `{ scalars, section, items }`:
 * scalars is a plain object, section is the list name or null, items is an array.
 */
export function parseListDoc(text) {
  const raw = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  const scalars = {};
  let section = null;
  const items = [];
  let current = null;

  raw.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "" || line.trim().startsWith("#")) return;

    if (!line.startsWith(" ")) {
      const { key, value } = splitPair(line, lineNumber, 0);
      if (value === null) {
        if (!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key)) {
          throw new Error(`line ${lineNumber}: bad section "${key}"`);
        }
        section = key;
        current = null;
        return;
      }
      scalars[key] = value;
      return;
    }

    if (!section) throw new Error(`line ${lineNumber}: indented line outside a section`);
    if (line.startsWith("  - ")) {
      const { key, value } = splitPair(line.slice(4), lineNumber, 0);
      current = { [key]: value };
      items.push(current);
      return;
    }
    if (line.startsWith("    ") && current) {
      const { key, value } = splitPair(line.slice(4), lineNumber, 0);
      current[key] = value;
      return;
    }
    throw new Error(`line ${lineNumber}: unexpected indentation`);
  });

  return { scalars, section, items };
}

function quote(value) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value);
  if (/^[\p{L}\p{N}_.:/@-]+$/u.test(text) && !/^\d+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Writes the narrow document. Item keys are sorted; scalar keys keep the order
 * given in `scalarOrder` (host, updated_at, …) so the file reads top-down.
 */
export function stringifyListDoc({ scalars = {}, section = "items", items = [] }, scalarOrder = []) {
  const keys = [
    ...scalarOrder.filter((key) => scalars[key] !== undefined),
    ...Object.keys(scalars)
      .filter((key) => !scalarOrder.includes(key))
      .sort(),
  ];
  const lines = keys.map((key) => `${key}: ${quote(scalars[key])}`);
  if (section) {
    lines.push(`${section}:`);
    for (const item of items) {
      const itemKeys = Object.keys(item).sort();
      if (itemKeys.length === 0) continue;
      itemKeys.forEach((key, index) => {
        lines.push(`${index === 0 ? "  - " : "    "}${key}: ${quote(item[key])}`);
      });
    }
  }
  return `${lines.join("\n")}\n`;
}

export function readListDoc(file) {
  if (!file || !existsSync(file)) return null;
  return parseListDoc(readFileSync(file, "utf8"));
}

export function writeListDoc(file, doc, scalarOrder = []) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringifyListDoc(doc, scalarOrder), "utf8");
  return doc;
}

/** Section items as `{ [keyField]: value }`, keeping the file order. */
export function indexItems(items, keyField) {
  const map = new Map();
  for (const item of items ?? []) {
    const key = item?.[keyField];
    if (key === undefined || key === null || key === "") continue;
    map.set(String(key), item);
  }
  return map;
}
