// Validates a parsed YAML document against a `lib/<domain>/*.ts` contract.
//
// The schema comes from `typescript.mjs`, so the type file is the only place a
// field is declared. Errors carry the JSON path and, when the caller passed the
// line index from `parseYamlWithLines`, the line a human typed.

import { describeType, literalValues } from "./typescript.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function leaf(node) {
  if (!node) return false;
  return node.kind !== "object" && node.kind !== "ref";
}

class Context {
  constructor(schema, options) {
    this.types = schema.types;
    this.imports = new Set(schema.imports ?? []);
    this.lines = options.lines ?? new Map();
    this.strict = Boolean(options.strict);
    this.allowUnknown = Boolean(options.allowUnknown);
    this.errors = [];
    this.warnings = [];
    this.total = 0;
    this.filled = 0;
    this.missing = [];
  }

  line(path) {
    return this.lines.get(path) ?? null;
  }

  error(path, message) {
    this.errors.push({ path: path || "(root)", message, line: this.line(path) });
  }

  warn(path, message) {
    this.warnings.push({ path: path || "(root)", message, line: this.line(path) });
  }

  resolve(node, path) {
    if (!node || node.kind !== "ref") return node;
    const decl = this.types.get(node.name);
    if (!decl) {
      if (this.imports.has(node.name)) {
        this.warn(path, `type "${node.name}" is imported from another file; field not checked`);
        return { kind: "any" };
      }
      this.error(path, `unknown type "${node.name}"`);
      return null;
    }
    return decl.kind === "alias" ? decl.type : { kind: "object", fields: decl.fields, name: decl.name };
  }
}

function countField(ctx, value) {
  ctx.total += 1;
  if (!isEmpty(value)) ctx.filled += 1;
}

function walk(ctx, node, value, path) {
  if (!node) return;
  const resolved = ctx.resolve(node, path);
  if (!resolved) return;

  switch (resolved.kind) {
    case "any":
      return;
    case "null":
      if (value !== null) ctx.error(path, "expected null");
      return;
    case "literal":
      if (value !== resolved.value) ctx.error(path, `expected "${resolved.value}", got ${JSON.stringify(value)}`);
      return;
    case "string":
      if (typeof value !== "string") ctx.error(path, `expected a string, got ${typeName(value)}`);
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) ctx.error(path, `expected a number, got ${typeName(value)}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") ctx.error(path, `expected true or false, got ${typeName(value)}`);
      return;
    case "array": {
      if (value === null) {
        ctx.error(path, "expected a list, got null; write at least one item");
        return;
      }
      if (!Array.isArray(value)) {
        ctx.error(path, `expected a list, got ${typeName(value)}`);
        return;
      }
      value.forEach((item, index) => walk(ctx, resolved.of, item, `${path}[${index}]`));
      return;
    }
    case "record": {
      if (!isPlainObject(value)) {
        ctx.error(path, `expected a map, got ${typeName(value)}`);
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        walk(ctx, resolved.value, item, path ? `${path}.${key}` : key);
      }
      return;
    }
    case "union": {
      const options = resolved.options;
      if (value === null && options.some((option) => option.kind === "null")) return;
      const allowed = literalValues(resolved, ctx.types);
      if (allowed && typeof value === "string") {
        if (!allowed.includes(value)) {
          ctx.error(path, `expected one of ${allowed.map((item) => `"${item}"`).join(", ")}, got "${value}"`);
        }
        return;
      }
      if (allowed && value !== null) {
        ctx.error(path, `expected one of ${allowed.map((item) => `"${item}"`).join(", ")}, got ${typeName(value)}`);
        return;
      }
      const matched = options.some((option) => {
        const probe = new Context({ types: ctx.types, imports: [...ctx.imports] }, { lines: ctx.lines });
        walk(probe, option, value, path);
        return probe.errors.length === 0;
      });
      if (!matched) ctx.error(path, `expected ${describeType(resolved, ctx.types)}, got ${typeName(value)}`);
      return;
    }
    case "object":
      walkObject(ctx, resolved.fields ?? [], value, path);
      return;
    default:
      ctx.error(path, `unsupported schema node "${resolved.kind}"`);
  }
}

function walkObject(ctx, fields, value, path) {
  if (value === null) {
    ctx.error(path, "expected a map, got null");
    return;
  }
  if (!isPlainObject(value)) {
    ctx.error(path, `expected a map, got ${typeName(value)}`);
    return;
  }

  const known = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(value)) {
    if (known.has(key)) continue;
    const message = `unknown field "${key}"`;
    if (ctx.strict) ctx.error(path ? `${path}.${key}` : key, message);
    else if (!ctx.allowUnknown) ctx.warn(path ? `${path}.${key}` : key, message);
  }

  for (const field of fields) {
    const childPath = path ? `${path}.${field.name}` : field.name;
    const present = Object.prototype.hasOwnProperty.call(value, field.name);
    const fieldValue = present ? value[field.name] : undefined;

    if (!present) {
      if (field.optional) continue;
      ctx.error(childPath, "missing required field");
      ctx.missing.push(childPath);
      if (leaf(field.type)) ctx.total += 1;
      continue;
    }

    if (fieldValue === null) {
      const nullable = allowsNull(ctx, field.type);
      if (!nullable) {
        const message = `expected ${describeType(field.type, ctx.types)}, got null`;
        if (ctx.strict) ctx.error(childPath, message);
        else ctx.warn(childPath, message);
      }
      if (leaf(field.type)) countField(ctx, null);
      continue;
    }

    if (leaf(field.type)) countField(ctx, fieldValue);
    walk(ctx, field.type, fieldValue, childPath);
  }
}

function allowsNull(ctx, node) {
  const resolved = ctx.resolve(node, "");
  if (!resolved) return true;
  if (resolved.kind === "null" || resolved.kind === "any") return true;
  if (resolved.kind === "union") return resolved.options.some((option) => allowsNull(ctx, option));
  return false;
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value;
}

/**
 * Validates a document against a parsed contract.
 * Returns `{ ok, errors, warnings, completeness }`.
 */
export function validateDocument(value, schema, options = {}) {
  const ctx = new Context(schema, options);
  const decl = schema.types.get(schema.entry);
  if (!decl) {
    return {
      ok: false,
      errors: [{ path: "(root)", message: `entry type "${schema.entry}" is not declared`, line: null }],
      warnings: [],
      completeness: { total: 0, filled: 0, ratio: 0, missing: [] },
    };
  }
  const node = decl.kind === "alias" ? decl.type : { kind: "object", fields: decl.fields, name: decl.name };
  walk(ctx, node, value, "");
  const ratio = ctx.total === 0 ? 0 : Math.round((ctx.filled / ctx.total) * 100) / 100;
  return {
    ok: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    completeness: { total: ctx.total, filled: ctx.filled, ratio, missing: ctx.missing },
  };
}
