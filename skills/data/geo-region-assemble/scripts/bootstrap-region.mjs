#!/usr/bin/env node
// Bootstraps a new geo/<region>/ folder: area.yaml, districts.json template and
// per-district folders with area.yaml and an empty springs.geojson.
// Read-only with respect to the network: it only writes local files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isEntryPoint, parseFlags, wantsHelp } from "#lib/cli.mjs";

const usage = `Usage:
  node scripts/bootstrap-region.mjs --region kaliningrad-oblast
  node scripts/bootstrap-region.mjs --region kaliningrad-oblast --districts geo/kaliningrad-oblast/districts.json

Flags:
  --region     geo folder name (required)
  --districts  path to a districts.json mapping; creates per-district folders
  --force      overwrite existing area.yaml and empty springs.geojson
  --help       print this usage and exit`;

const toAreaCard = ({ name, type, subject, description }) => {
  const body = description
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : ""))
    .join("\n");
  const lines = [`name: ${JSON.stringify(name)}`];
  if (type) lines.push(`type: ${JSON.stringify(type)}`);
  if (subject) lines.push(`subject: ${JSON.stringify(subject)}`);
  lines.push("description: |", body);
  return `${lines.join("\n")}\n`;
};

const areaTemplate = (region) => `# ${region}

## Область

TODO: описание региона.

## Как устроена папка

Внутренняя секция, вырезается загрузчиком.
`;

const emptySprings = () => JSON.stringify({ type: "FeatureCollection", count: 0, features: [] }, null, 2) + "\n";

const emptyDistricts = (region) => JSON.stringify({
  region,
  admin_subject: region,
  bbox: [0, 0, 0, 0],
  districts: [],
}, null, 2) + "\n";

const main = () => {
  if (wantsHelp(process.argv.slice(2))) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }

  const flags = parseFlags(process.argv.slice(2), { region: "string", districts: "string", force: "boolean" });
  if (!flags.region) throw new Error("--region is required");

  const regionDir = path.join(process.cwd(), "geo", flags.region);
  mkdirSync(regionDir, { recursive: true });

  const areaFile = path.join(regionDir, "area.yaml");
  if (flags.force || !existsSync(areaFile)) {
    writeFileSync(
      areaFile,
      toAreaCard({
        name: areaTemplate(flags.region).match(/^#\s+(.+)$/m)?.[1]?.trim() ?? flags.region,
        subject: flags.region,
        description: "TODO: описание региона.",
      }),
    );
  }

  const districtsFile = flags.districts
    ? path.resolve(process.cwd(), flags.districts)
    : path.join(regionDir, "districts.json");

  if (flags.districts) {
    if (!existsSync(districtsFile)) throw new Error(`districts file not found: ${districtsFile}`);
    const data = JSON.parse(readFileSync(districtsFile, "utf8"));
    const districts = Array.isArray(data) ? data : data.districts ?? [];
    for (const district of districts) {
      const slug = district.slug ?? district.district_slug;
      if (!slug) continue;
      const districtDir = path.join(regionDir, slug);
      mkdirSync(districtDir, { recursive: true });
      const districtArea = path.join(districtDir, "area.yaml");
      if (flags.force || !existsSync(districtArea)) {
        writeFileSync(
          districtArea,
          toAreaCard({
            name: district.name ?? slug,
            type: district.type ?? district.district_type ?? null,
            subject: district.subject ?? district.admin_subject ?? null,
            description: "TODO: описание района.",
          }),
        );
      }
      const springsFile = path.join(districtDir, "springs.geojson");
      if (flags.force || !existsSync(springsFile)) {
        writeFileSync(springsFile, emptySprings());
      }
    }
  } else if (!existsSync(districtsFile)) {
    writeFileSync(districtsFile, emptyDistricts(flags.region));
  }

  process.stdout.write(JSON.stringify({
    region: flags.region,
    region_dir: path.relative(process.cwd(), regionDir),
    districts_file: path.relative(process.cwd(), districtsFile),
    created: true,
  }, null, 2) + "\n");
};

if (isEntryPoint(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
