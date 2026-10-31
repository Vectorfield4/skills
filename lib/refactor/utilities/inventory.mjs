// Read-only structural inventory of a project: the facts a refactor pass plans from.
//
// Usage:
//   node inventory.mjs [<project>] [--out <file>] [--max-files N] [--help]
//
// The report names the layer contract the project claims, walks its source tree,
// resolves every import to a project-relative path and lists the structural
// violations it can prove. It reports facts only and never proposes a move:
// proposals belong to the refactoring skill's plan phase.
//
// Exit codes: 0 report produced (violations included), 1 project is not a
// directory, 2 bad usage.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isEntryPoint, logLine, parseFlags, printJson, wantsHelp } from "#lib/cli.mjs";

/** Layer contract when the project claims none: Feature-Slice Design, top to bottom. */
export const DEFAULT_LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

/** Atomic Design levels inside a `ui/` folder. */
export const DEFAULT_LEVELS = ["atoms", "molecules", "organisms"];

/** Default source alias. */
export const DEFAULT_ALIAS = "@/";

/** Extensions that count as source. */
export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro", ".vue", ".svelte"];

/** Extensions tried when an import specifier omits one. */
const RESOLVE_EXTENSIONS = SOURCE_EXTENSIONS;

/** Directories never walked. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "coverage", ".astro", "storybook-static"]);

/** Default walk cap. */
export const DEFAULT_MAX_FILES = 20000;

const USAGE = `inventory - read-only structural report for a project

  node inventory.mjs [<project>] [--out <file>] [--max-files N] [--help]

Arguments
  <project>        Project root, default the current directory.

Flags
  --out <file>     Also write the JSON report to this file.
  --max-files N    Walk cap, default ${DEFAULT_MAX_FILES}. Sets "truncated": true when hit.
  --help           Print this block.

Exit codes
  0  report produced (violations included)
  1  the project path is not a directory
  2  bad usage`;

/** Smallest-to-largest string compare, independent of locale. */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const toPosix = (value) => value.split(path.sep).join("/");

const isDirectory = (target) => {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (target) => {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
};

const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** True when every default layer name appears as a whole word. */
function namesLayers(text) {
  if (!text) return false;
  return DEFAULT_LAYERS.every((layer) => new RegExp(`\\b${layer}\\b`, "i").test(text));
}

/**
 * The contract the project claims. A document that names no layer leaves the
 * default in place, so the report never invents a source it did not read.
 */
export function detectContract(project) {
  const agents = readText(path.join(project, "AGENTS.md"));
  if (namesLayers(agents)) {
    return { source: "AGENTS.md", layers: [...DEFAULT_LAYERS], levels: [...DEFAULT_LEVELS], alias: DEFAULT_ALIAS };
  }

  const atomic = readText(path.join(project, "docs", "frontend", "atomic-design.md"));
  if (namesLayers(atomic)) {
    return {
      source: "docs/frontend/atomic-design.md",
      layers: [...DEFAULT_LAYERS],
      levels: [...DEFAULT_LEVELS],
      alias: DEFAULT_ALIAS,
    };
  }

  return { source: "default", layers: [...DEFAULT_LAYERS], levels: [...DEFAULT_LEVELS], alias: DEFAULT_ALIAS };
}

/**
 * Every file under `root`, sorted by name at each level so two runs see the same
 * order. `truncated` is set only when a file beyond the cap was actually found.
 */
export function collectFiles(root, options = {}) {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const files = [];
  let truncated = false;

  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => compareText(a.name, b.name));

    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        visit(full);
      } else if (entry.isFile()) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(full);
      }
    }
  };

  visit(root);
  return { files, truncated };
}

const STATEMENT_START = /^\s*(?:import|export)\b/;
const FROM_SPECIFIER = /\bfrom\s*["']([^"']+)["']/;

const unbalancedBraces = (text) => (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;

/**
 * `import ... from "<spec>"` and `export ... from "<spec>"` statements with their
 * 1-based line. A braced block that continues on the next line is joined, so a
 * multi-line import reports the line it starts on.
 */
export function importSpecifiers(text) {
  const lines = text.split("\n");
  const out = [];

  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index].replace(/\r$/, "");
    if (!STATEMENT_START.test(first)) continue;

    let buffer = first;
    let cursor = index;
    while (!FROM_SPECIFIER.test(buffer) && unbalancedBraces(buffer) > 0 && cursor - index < 40 && cursor + 1 < lines.length) {
      cursor += 1;
      buffer += `\n${lines[cursor].replace(/\r$/, "")}`;
    }

    const match = FROM_SPECIFIER.exec(buffer);
    if (match) out.push({ spec: match[1], line: index + 1 });
    index = cursor;
  }

  return out;
}

/**
 * An import specifier as a project-relative path. `@/x` maps to `src/x`, a
 * relative spec resolves against the importing file, a bare package name returns
 * null. `resolved` is false when no candidate file exists.
 */
export function resolveImport(spec, fromFile, root, alias = DEFAULT_ALIAS) {
  let base;
  if (spec.startsWith(alias)) base = path.join(root, "src", spec.slice(alias.length));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;

  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...RESOLVE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (isFile(candidate)) return { rel: toPosix(path.relative(root, candidate)), resolved: true };
  }

  return { rel: toPosix(path.relative(root, base)), resolved: false };
}

/** The layer a project-relative path sits in, or null outside `src/`. */
export function layerOf(rel) {
  const segments = rel.split("/");
  if (segments[0] !== "src") return null;
  return segments[1] ?? null;
}

/** The Atomic Design level and slice of a path inside `ui/<level>/`. */
export function levelOf(rel, levels = DEFAULT_LEVELS) {
  const segments = rel.split("/");
  const index = segments.indexOf("ui");
  if (index === -1 || index + 1 >= segments.length) return null;
  const level = segments[index + 1];
  if (!levels.includes(level)) return null;
  return { slice: segments.slice(0, index).join("/"), level };
}

/** Tarjan over the layer graph; only groups of two or more are cycles. */
function stronglyConnected(nodes, adjacency) {
  let counter = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const groups = [];

  const strong = (node) => {
    indices.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!indices.has(next)) {
        strong(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), indices.get(next)));
      }
    }

    if (low.get(node) === indices.get(node)) {
      const group = [];
      for (;;) {
        const item = stack.pop();
        onStack.delete(item);
        group.push(item);
        if (item === node) break;
      }
      groups.push(group);
    }
  };

  for (const node of nodes) {
    if (!indices.has(node)) strong(node);
  }

  return groups.filter((group) => group.length > 1);
}

/** One `layer-cycle` violation per cycle, named by its smallest layer. */
function layerCycles(edges, layers) {
  const adjacency = new Map();
  for (const layer of layers) adjacency.set(layer, new Set());

  for (const edge of edges) {
    if (!edge.fromLayer || !edge.toLayer) continue;
    if (edge.fromLayer === edge.toLayer) continue;
    if (!adjacency.has(edge.fromLayer) || !adjacency.has(edge.toLayer)) continue;
    adjacency.get(edge.fromLayer).add(edge.toLayer);
  }

  const violations = [];
  for (const group of stronglyConnected(layers, adjacency)) {
    const names = [...group].sort(compareText);
    const inside = edges
      .filter((edge) => group.includes(edge.fromLayer) && group.includes(edge.toLayer))
      .sort((a, b) => compareText(a.from, b.from) || a.line - b.line);
    const anchor = inside[0];
    violations.push({
      kind: "layer-cycle",
      file: anchor ? anchor.from : "",
      line: anchor ? anchor.line : 0,
      detail: `${names.join(" -> ")} -> ${names[0]}`,
    });
  }

  return violations;
}

const sortedCounts = (counts) => {
  const out = {};
  for (const key of Object.keys(counts).sort(compareText)) out[key] = counts[key];
  return out;
};

/**
 * The inventory report. Read-only: it opens files for reading and writes nothing.
 */
export function inventory(project = process.cwd(), options = {}) {
  const root = path.resolve(project);
  const maxFiles = Number.isInteger(options.maxFiles) ? options.maxFiles : DEFAULT_MAX_FILES;
  const contract = detectContract(root);

  const report = {
    ok: true,
    project: root,
    generatedAt: new Date().toISOString(),
    truncated: false,
    contract,
    stats: { files: 0, sourceFiles: 0, byLayer: {}, byLevel: {} },
    edges: [],
    violations: [],
    error: null,
  };

  if (!isDirectory(root)) {
    return { ...report, ok: false, error: `${root} is not a directory` };
  }

  const walkRoot = isDirectory(path.join(root, "src")) ? path.join(root, "src") : root;
  const { files, truncated } = collectFiles(walkRoot, { maxFiles });
  report.truncated = truncated;
  report.stats.files = files.length;

  const byLayer = {};
  const byLevel = {};
  const edges = [];
  const violations = [];
  const layerIndex = (layer) => contract.layers.indexOf(layer);

  for (const file of files) {
    const rel = toPosix(path.relative(root, file));
    const extension = path.extname(file).toLowerCase();
    if (!SOURCE_EXTENSIONS.includes(extension)) continue;

    report.stats.sourceFiles += 1;

    const layer = layerOf(rel);
    if (rel.startsWith("src/") && layer && layerIndex(layer) === -1) {
      violations.push({
        kind: "file-outside-layer",
        file: rel,
        line: 1,
        detail: `${layer} is not a contract layer (${contract.layers.join(", ")})`,
      });
    }
    if (layer && layerIndex(layer) !== -1) byLayer[layer] = (byLayer[layer] ?? 0) + 1;

    const level = levelOf(rel, contract.levels);
    if (level) byLevel[level.level] = (byLevel[level.level] ?? 0) + 1;

    for (const { spec, line } of importSpecifiers(readText(file))) {
      const target = resolveImport(spec, file, root, contract.alias);
      if (!target) continue;

      const toLayer = layerOf(target.rel);
      edges.push({
        from: rel,
        to: target.rel,
        spec,
        line,
        fromLayer: layer && layerIndex(layer) !== -1 ? layer : null,
        toLayer: toLayer && layerIndex(toLayer) !== -1 ? toLayer : null,
      });

      if (!target.resolved) continue;
      if (!layer || layerIndex(layer) === -1) continue;
      if (!toLayer || layerIndex(toLayer) === -1) continue;
      if (target.rel === rel) continue;

      if (layerIndex(toLayer) < layerIndex(layer)) {
        violations.push({
          kind: "import-upward",
          file: rel,
          line,
          detail: `${layer} imports ${toLayer} through "${spec}"`,
        });
      }

      if (level) {
        const targetLevel = levelOf(target.rel, contract.levels);
        if (targetLevel && targetLevel.slice === level.slice && targetLevel.level !== level.level) {
          violations.push({
            kind: "atomic-level-mismatch",
            file: rel,
            line,
            detail: `${level.level} imports ${targetLevel.level} through "${spec}"`,
          });
        }
      }
    }
  }

  report.stats.byLayer = sortedCounts(byLayer);
  report.stats.byLevel = sortedCounts(byLevel);

  violations.push(...layerCycles(edges, contract.layers));
  violations.sort(
    (a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.kind, b.kind),
  );

  edges.sort(
    (a, b) => compareText(a.from, b.from) || compareText(a.to, b.to) || compareText(a.spec, b.spec),
  );

  report.edges = edges.map(({ from, to, spec }) => ({ from, to, spec }));
  report.violations = violations;
  return report;
}

/** CLI: one JSON document on stdout, exit 0 when a report was produced. */
export function main(argv = process.argv.slice(2)) {
  const args = argv;

  if (wantsHelp(args)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let flags;
  try {
    flags = parseFlags(args, { out: "string", "max-files": "number" });
  } catch (error) {
    logLine(`${error.message}\n\n${USAGE}`);
    return 2;
  }

  const maxFiles = flags["max-files"] ?? DEFAULT_MAX_FILES;
  if (!Number.isInteger(maxFiles) || maxFiles < 1) {
    logLine(`--max-files takes a positive integer\n\n${USAGE}`);
    return 2;
  }

  const project = path.resolve(flags._[0] ?? process.cwd());
  const report = inventory(project, { maxFiles });

  if (flags.out) {
    try {
      mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
      writeFileSync(path.resolve(flags.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } catch (error) {
      logLine(`cannot write ${flags.out}: ${error.message}`);
      return 2;
    }
  }

  printJson(report);
  return report.ok ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  process.exit(main());
}
