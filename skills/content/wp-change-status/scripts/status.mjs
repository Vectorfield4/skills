#!/usr/bin/env node
// Update the status of existing WordPress posts via REST API (basic auth).

import { resolveWpConfig } from "#lib/wp-config.mjs";

function parseIds(raw) {
  const ids = new Set();
  for (const part of String(raw || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const range = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ids.add(i);
    } else if (/^\d+$/.test(p)) {
      ids.add(Number(p));
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function parseArgs(argv) {
  const o = { host: null, key: null, user: "admin", ids: null, status: "publish", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host") o.host = argv[++i];
    else if (a === "--key") o.key = argv[++i];
    else if (a === "--user") o.user = argv[++i];
    else if (a === "--ids") o.ids = argv[++i];
    else if (a === "--status") o.status = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.host || !o.key) {
    console.error("Usage: node status.mjs --host <host> --key <ENV_VAR> [--user admin] [--ids 44-50] [--status publish] [--dry-run]");
    process.exit(1);
  }
  const ids = parseIds(o.ids);
  if (ids.length === 0) {
    console.error("No post ids given. Use --ids 44-50 or --ids 44,45,46.");
    process.exit(1);
  }

  const config = { baseUrl: o.host, auth: { type: "basic", user: o.user, password: { keyName: o.key } } };
  let resolved;
  try {
    resolved = resolveWpConfig(config);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const base = resolved.baseUrl.replace(/\/+$/, "");
  const endpoint = (id) => `${base}/wp-json/wp/v2/posts/${id}`;

  if (o.dryRun) {
    console.log(JSON.stringify({ baseUrl: base, authType: resolved.authType, status: o.status, ids }, null, 2));
    return;
  }

  for (const id of ids) {
    try {
      const res = await fetch(endpoint(id), {
        method: "POST",
        headers: { Authorization: resolved.authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ status: o.status }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.log(`post ${id} FAILED: ${res.status} : ${text.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      console.log(`post ${id} -> status=${data.status} link=${data.link}`);
    } catch (e) {
      console.log(`post ${id} FAILED: ${e.message}`);
    }
  }
}

main();