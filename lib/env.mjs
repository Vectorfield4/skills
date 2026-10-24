// Environment lookup that also sees Windows user and machine variables.
import { execFileSync } from "node:child_process";

const WINDOWS_ROOTS = [
  "HKCU\\Environment",
  "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
];

function readWindowsRegistry(name) {
  for (const root of WINDOWS_ROOTS) {
    try {
      const output = execFileSync("reg", ["query", root, "/v", name], {
        encoding: "utf8",
        windowsHide: true,
        // A missing value is the normal case: keep the OEM-encoded
        // "ERROR: not found" line out of every skill's stderr.
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^\s*(.+?)\s{2,}(REG_[A-Z_]+)\s{2,}(.*)$/);
        if (match && match[1] === name) return match[3].trim() || undefined;
      }
    } catch {
      // The name is absent from this hive.
    }
  }
  return undefined;
}

export function readEnv(name, env = process.env, { os = env === process.env } = {}) {
  if (!name) return undefined;
  if (env[name] !== undefined) {
    return typeof env[name] === "string" && env[name].length === 0 ? undefined : env[name];
  }
  if (!os || process.platform !== "win32") return undefined;
  return readWindowsRegistry(name);
}