// The geo stage scripts are entry points, so the contract that matters is the process:
// `--help` prints a usage block and exits 0, and a malformed flag fails before any
// network request. Nothing here touches Overpass.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPTS = fileURLToPath(new URL("../skills/data/geo-region-assemble/scripts/", import.meta.url));

const run = (script, args = []) =>
  spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: "utf8" });

const WITH_USAGE = [
  "assemble.mjs",
  "bootstrap-region.mjs",
  "build-index.mjs",
  "fetch-boundaries.mjs",
  "fetch-osm-springs.mjs",
  "fetch-region-outline.mjs",
  "fetch-seas.mjs",
  "fetch-roads.mjs",
  "fetch-water.mjs",
  "validate-region.mjs",
];

describe("geo stage CLIs", () => {
  it("prints usage and exits 0 for --help", () => {
    for (const script of WITH_USAGE) {
      const result = run(script, ["--help"]);
      expect(result.status, script).toBe(0);
      expect(result.stdout, script).toContain("Usage:");
      expect(result.stdout, script).toContain("--help");
    }
  });

  it("rejects a malformed admin level or bbox before the first request", () => {
    const levels = run("fetch-boundaries.mjs", ["--region", "x", "--area", "1", "--admin-level", "6,abc"]);
    expect(levels.status).toBe(1);
    expect(levels.stderr).toContain("--admin-level takes comma separated integers");

    const bbox = run("fetch-osm-springs.mjs", ["--region", "x", "--bbox", "59,29"]);
    expect(bbox.status).toBe(1);
    expect(bbox.stderr).toContain("--bbox needs four numbers");
  });

  it("refuses an unknown stage name", () => {
    const result = run("assemble.mjs", ["--region", "x", "--stages", "outline,springs"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown stage "springs"');
  });
});
