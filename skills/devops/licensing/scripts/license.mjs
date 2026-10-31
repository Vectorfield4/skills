/**
 * Apply and audit the Vectorfield4 Main License with the Login AI sublicense.
 *
 * Usage:
 *   node scripts/license.mjs <project> --check
 *   node scripts/license.mjs <project> --apply
 *   node scripts/license.mjs <project> --apply --config .login-ai-license.json
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint, printJson, runUtility } from "#lib/cli.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAIN_LICENSE = join(
  SKILL_DIR,
  "references",
  "vectorfield4-main-license.txt",
);
const DEFAULT_SUBLICENSE = join(SKILL_DIR, "references", "login-ai-license.txt");
const CONFIG_NAME = ".login-ai-license.json";

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const DEFAULTS = {
  owner: "Vectorfield4",
  author: {
    name: "Filipp Kuksov",
    email: "vectorfield4@gmail.com",
    url: "https://github.com/Vectorfield4",
  },
  copyright: "© 2026 Login AI",
  mainLicenseName: "Vectorfield4 Main License",
  mainLicenseFile: "LICENSE",
  licenseName: "Login AI License",
  licenseFile: "LICENSE-LOGIN-AI",
  copyrightFile: "COPYRIGHT",
  packageLicense: "Login AI",
  licenseContains: [
    "Login AI License",
    "sublicense",
    "Vectorfield4",
    "cto@loginai.ru",
    "vectorfield4@gmail.com",
    "read",
    "process",
    "edit",
    "transfer",
    "display",
    "commercial",
    "permission",
  ],
  dataset: null,
  datasetSource: {
    author: "Filipp Kuksov",
    licenseUrl: "/license/",
  },
  stripItemFields: [],
  forbidden: ["Open Food Facts", "Wikidata", "ODbL", "CC0"],
  requireIn: ["README.md"],
  include: ["README.md", "package.json", "src"],
  exclude: [
    "node_modules",
    "dist",
    ".git",
    ".astro",
    "package-lock.json",
    CONFIG_NAME,
    "LICENSE",
    "LICENSE-LOGIN-AI",
    "COPYRIGHT",
  ],
};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeText(file, text) {
  writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function mentionsProtected(value) {
  return /vectorfield4|login ai/i.test(JSON.stringify(value ?? ""));
}

function loadConfig(projectRoot, explicitPath) {
  const configPath = explicitPath
    ? resolve(projectRoot, explicitPath)
    : join(projectRoot, CONFIG_NAME);

  if (!existsSync(configPath)) return { ...DEFAULTS, configPath: null };

  return {
    ...DEFAULTS,
    ...readJson(configPath),
    configPath,
  };
}

function readLicense(file) {
  if (!existsSync(file)) {
    throw new Error(`license text not found: ${file}`);
  }

  const text = readFileSync(file, "utf8").trimEnd();
  if (!text) throw new Error(`license text is empty: ${file}`);
  if (/TODO|PENDING|PLACEHOLDER/i.test(text)) {
    throw new Error(`license text is not approved: ${file}`);
  }

  return `${text}\n`;
}

function updatePackage(projectRoot, config) {
  const file = join(projectRoot, "package.json");
  if (!existsSync(file)) return null;

  const manifest = readJson(file);
  if (!mentionsProtected(manifest.license)) {
    manifest.license = config.packageLicense;
  }
  if (!mentionsProtected(manifest.author)) {
    manifest.author = config.author;
  }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return "package.json";
}

function updateDataset(projectRoot, config) {
  if (!config.dataset) return null;

  const file = join(projectRoot, config.dataset);
  if (!existsSync(file)) {
    throw new Error(`dataset not found: ${config.dataset}`);
  }

  const data = readJson(file);
  if (Array.isArray(data)) {
    throw new Error("dataset root must be an object with a source field");
  }

  const source = {
    ...(config.datasetSource ?? {}),
    name: config.owner,
    license: config.licenseName,
    mainLicense: config.mainLicenseName,
    copyright: config.copyright,
  };
  delete source.wikidata;

  data.source = source;
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    for (const field of config.stripItemFields) delete item[field];
  }

  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return config.dataset;
}

function applyLicense(projectRoot, config, mainLicenseText, sublicenseText) {
  const applied = [];

  writeText(join(projectRoot, config.mainLicenseFile), mainLicenseText);
  applied.push(config.mainLicenseFile);

  writeText(join(projectRoot, config.licenseFile), sublicenseText);
  applied.push(config.licenseFile);

  if (config.copyrightFile) {
    writeText(join(projectRoot, config.copyrightFile), config.copyright);
    applied.push(config.copyrightFile);
  }

  const packageFile = updatePackage(projectRoot, config);
  if (packageFile) applied.push(packageFile);

  const datasetFile = updateDataset(projectRoot, config);
  if (datasetFile) applied.push(datasetFile);

  return applied;
}

function walk(projectRoot, target, config, out) {
  if (!existsSync(target)) return;

  const stats = statSync(target);
  const relativePath = relative(projectRoot, target).replace(/\\/g, "/");
  if (relativePath && config.exclude.includes(relativePath)) return;

  if (stats.isDirectory()) {
    for (const name of readdirSync(target)) {
      if (config.exclude.includes(name)) continue;
      walk(projectRoot, join(target, name), config, out);
    }
    return;
  }

  if (!stats.isFile()) return;
  if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) return;
  out.add(target);
}

function collectFiles(projectRoot, config) {
  const files = new Set();
  for (const entry of config.include) {
    walk(projectRoot, join(projectRoot, entry), config, files);
  }
  return [...files].sort();
}

function checkDataset(projectRoot, config, errors) {
  if (!config.dataset) return;

  const file = join(projectRoot, config.dataset);
  if (!existsSync(file)) {
    errors.push(`dataset not found: ${config.dataset}`);
    return;
  }

  const data = readJson(file);
  const source = data?.source;
  if (!source || source.name !== config.owner) {
    errors.push(`dataset source.name must be "${config.owner}"`);
  }
  if (!source || source.license !== config.licenseName) {
    errors.push(`dataset source.license must be "${config.licenseName}"`);
  }
  if (!source || source.mainLicense !== config.mainLicenseName) {
    errors.push(`dataset source.mainLicense must be "${config.mainLicenseName}"`);
  }
  if (config.datasetSource?.author && source?.author !== config.datasetSource.author) {
    errors.push(`dataset source.author must be "${config.datasetSource.author}"`);
  }
  if (source?.wikidata) {
    errors.push("dataset source.wikidata must be removed");
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  for (const field of config.stripItemFields) {
    if (items.some((item) => item && Object.hasOwn(item, field))) {
      errors.push(`dataset items still contain "${field}"`);
    }
  }
}

function scan(projectRoot, config) {
  const errors = [];
  const warnings = [];

  const mainLicensePath = join(projectRoot, config.mainLicenseFile);
  if (!existsSync(mainLicensePath)) {
    errors.push(`${config.mainLicenseFile} is missing`);
  } else {
    const license = readFileSync(mainLicensePath, "utf8");
    if (!license.includes(config.mainLicenseName)) {
      errors.push(
        `${config.mainLicenseFile} does not contain "${config.mainLicenseName}"`,
      );
    }
  }

  const licensePath = join(projectRoot, config.licenseFile);
  if (!existsSync(licensePath)) {
    errors.push(`${config.licenseFile} is missing`);
  } else {
    const license = readFileSync(licensePath, "utf8");
    const lower = license.toLocaleLowerCase("en");
    if (!license.includes(config.licenseName)) {
      errors.push(`${config.licenseFile} does not contain "${config.licenseName}"`);
    }
    if (!license.includes(config.mainLicenseName)) {
      errors.push(`${config.licenseFile} does not reference "${config.mainLicenseName}"`);
    }
    for (const term of config.licenseContains) {
      if (!lower.includes(term.toLocaleLowerCase("en"))) {
        errors.push(`${config.licenseFile} does not contain "${term}"`);
      }
    }
  }

  if (config.copyrightFile) {
    const copyrightPath = join(projectRoot, config.copyrightFile);
    if (!existsSync(copyrightPath)) {
      errors.push(`${config.copyrightFile} is missing`);
    } else if (!readFileSync(copyrightPath, "utf8").includes(config.copyright)) {
      errors.push(`${config.copyrightFile} must contain "${config.copyright}"`);
    }
  }

  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    warnings.push("package.json is missing");
  } else {
    const manifest = readJson(packagePath);
    if (
      !mentionsProtected(manifest.license) &&
      manifest.license !== config.packageLicense
    ) {
      errors.push(
        `package.json license must be "${config.packageLicense}" or keep Vectorfield4`,
      );
    }
    if (mentionsProtected(manifest.author)) {
      // Keep an existing Vectorfield4 or Login AI author untouched.
    } else if (
      typeof manifest.author !== "object" ||
      manifest.author === null ||
      manifest.author.name !== config.author.name ||
      manifest.author.email !== config.author.email ||
      manifest.author.url !== config.author.url
    ) {
      errors.push(
        `package.json author must be { name, email, url } for ${config.author.name}`,
      );
    }
  }

  for (const file of config.requireIn) {
    const full = join(projectRoot, file);
    if (!existsSync(full)) continue;
    if (!readFileSync(full, "utf8").includes(config.licenseName)) {
      errors.push(`${file} does not mention "${config.licenseName}"`);
    }
  }

  checkDataset(projectRoot, config, errors);

  const files = collectFiles(projectRoot, config);
  for (const file of files) {
    const relativePath = relative(projectRoot, file).replace(/\\/g, "/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const lower = line.toLocaleLowerCase("en");
      for (const pattern of config.forbidden) {
        if (lower.includes(pattern.toLocaleLowerCase("en"))) {
          errors.push(`${relativePath}:${index + 1}: forbidden "${pattern}"`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    scanned: files.length,
  };
}

const usage = [
  "Usage:",
  "  node scripts/license.mjs <project> --check",
  "  node scripts/license.mjs <project> --apply [--config <path>]",
  "",
  "Options:",
  "  --apply             write LICENSE, LICENSE-LOGIN-AI, COPYRIGHT, package and dataset metadata",
  "  --check             audit only, the default",
  "  --config <path>     project config, defaults to .login-ai-license.json",
  "  --main-license <path>  Vectorfield4 main license for this run",
  "  --license <path>    Login AI sublicense text for this run",
];

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runUtility({
    usage,
    spec: {
      apply: "boolean",
      check: "boolean",
      config: "string",
      license: "string",
      "main-license": "string",
    },
    allowEmpty: true,
    main: async (flags) => {
      const projectRoot = resolve(flags._[0] ?? process.cwd());
      if (!existsSync(projectRoot)) {
        throw new Error(`project not found: ${projectRoot}`);
      }

      const config = loadConfig(projectRoot, flags.config);
      const mainLicenseText = readLicense(
        flags["main-license"]
          ? resolve(projectRoot, flags["main-license"])
          : DEFAULT_MAIN_LICENSE,
      );
      const sublicenseText = readLicense(
        flags.license ? resolve(projectRoot, flags.license) : DEFAULT_SUBLICENSE,
      );

      const applied = flags.apply
        ? applyLicense(projectRoot, config, mainLicenseText, sublicenseText)
        : [];

      const report = scan(projectRoot, config);
      printJson({
        project: projectRoot,
        mode: flags.apply ? "apply" : "check",
        ...report,
        applied,
      });

      return report.ok ? 0 : 1;
    },
  });
}

export { applyLicense, loadConfig, scan };
