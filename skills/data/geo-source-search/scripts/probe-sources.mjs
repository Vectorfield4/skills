#!/usr/bin/env node
// Probes geo data sources: HTTP reachability, final URL, content type, charset,
// and optional Overpass coverage counts. Read-only: writes only with --out.

import { existsSync } from "node:fs";
import { overpass, overpassAreaId, readJson, today, writeJson } from "#lib/geo.mjs";
import { BROWSER_UA } from "#lib/http.mjs";
import { isEntryPoint, parseFlags } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/probe-sources.mjs --sources geo/leningrad-oblast/authoritative-sources.json [--overpass-area 176095]
  node scripts/probe-sources.mjs --url https://overpass-api.de/ [--overpass-area 176095]

Flags:
  --sources        authoritative-sources.json or an array of {id, name, url}
  --url            single URL to probe
  --overpass-area  OSM relation id; adds spring, lake and boundary counts
  --endpoint       Overpass endpoint for the coverage counts
  --timeout        per request timeout in ms, default 20000
  --out            write JSON to this file instead of stdout only`;

const HEAD_BYTES = 8192;

const readHead = async (response) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8", 0, HEAD_BYTES);
};

const sniffCharset = (contentType, head) => {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType);
  if (fromHeader) return fromHeader[1].toLowerCase();
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return fromMeta ? fromMeta[1].toLowerCase() : null;
};

const sniffTitle = (head) => {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  return match ? match[1].replace(/\s+/g, " ").trim().slice(0, 160) : null;
};

export async function probeUrl(url, { timeoutMs = 20000 } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const head = await readHead(response);
    const contentType = response.headers.get("content-type") ?? "";
    return {
      url,
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      content_type: contentType.split(";")[0] || null,
      charset: sniffCharset(contentType, head),
      title: sniffTitle(head),
      elapsed_ms: Date.now() - started,
      error: null,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      final_url: null,
      content_type: null,
      charset: null,
      title: null,
      elapsed_ms: Date.now() - started,
      error: error.name === "AbortError" ? `timeout after ${timeoutMs} ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

const countOf = (payload) => Number(payload.elements?.[0]?.tags?.total ?? 0);

export async function probeOverpass(areaRelationId, { timeoutMs = 120000, endpoint } = {}) {
  const area = overpassAreaId(areaRelationId);
  const [springs, lakes, boundaries, roads] = await Promise.all([
    overpass(`[out:json][timeout:110];area(${area})->.a;node["natural"="spring"](area.a);out count;`, { timeoutMs, endpoint }),
    overpass(
      `[out:json][timeout:110];area(${area})->.a;(way["natural"="water"]["water"="lake"](area.a);relation["natural"="water"]["water"="lake"](area.a););out count;`,
      { timeoutMs, endpoint },
    ),
    overpass(`[out:json][timeout:110];area(${area})->.a;rel["boundary"="administrative"]["admin_level"="6"](area.a);out count;`, {
      timeoutMs,
      endpoint,
    }),
    overpass(`[out:json][timeout:110];area(${area})->.a;way["highway"](area.a);out count;`, { timeoutMs, endpoint }),
  ]);

  return {
    area_relation_id: areaRelationId,
    area_id: area,
    springs: countOf(springs),
    lakes: countOf(lakes),
    district_boundaries: countOf(boundaries),
    roads: countOf(roads),
  };
}

const loadSources = (flags) => {
  if (flags.url) return [{ id: "url", name: flags.url, url: flags.url }];
  if (!flags.sources) throw new Error("pass --sources <file> or --url <url>");
  if (!existsSync(flags.sources)) throw new Error(`sources file not found: ${flags.sources}`);
  const data = readJson(flags.sources);
  const sources = Array.isArray(data) ? data : data.sources;
  if (!Array.isArray(sources)) throw new Error("sources file must be an array or { sources: [...] }");
  return sources.filter((source) => source?.url);
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2), {
    sources: "string",
    url: "string",
    "overpass-area": "number",
    endpoint: "string",
    timeout: "number",
    out: "string",
  });

  const timeoutMs = flags.timeout ?? 20000;
  const sources = loadSources(flags);
  if (sources.length === 0) throw new Error("no sources with a url");

  const probes = [];
  for (const source of sources) {
    probes.push({
      id: source.id ?? null,
      name: source.name ?? null,
      ...(await probeUrl(source.url, { timeoutMs })),
    });
  }

  const report = {
    checked: today(),
    sources: probes,
    reachable: probes.filter((probe) => probe.ok).length,
    overpass: null,
  };

  if (flags["overpass-area"]) {
    try {
      report.overpass = await probeOverpass(flags["overpass-area"], {
        timeoutMs: Math.max(timeoutMs, 120000),
        endpoint: flags.endpoint,
      });
    } catch (error) {
      report.overpass = { area_relation_id: flags["overpass-area"], error: error.message };
    }
  }

  if (flags.out) writeJson(flags.out, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.reachable === 0) process.exit(1);
};

if (isEntryPoint(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
