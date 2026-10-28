// Model -> site tag mapping. Deterministic, rule-based, explainable.
//
// A tag is the reason a product appears under an article, so this node is the
// only place that may attach tags, and it only produces tags that already exist
// in the blog. A model with no matching rule is reported as `unmapped` instead
// of receiving a plausible-sounding tag.

import { buildAliasIndex, canonicalTag, normalizeTag } from "../product-match.mjs";
import { uniqueSorted } from "./stable.mjs";

/**
 * Accessories on a brand shop are not robots: a battery under «гуманоиды» is a
 * worse answer than no product. They are skipped and reported, not tagged.
 */
export const ACCESSORY_KEYWORDS = [
  "battery",
  "charger",
  "charging",
  "motor",
  "servo",
  "controller",
  "remote",
  "lidar",
  "camera",
  "cable",
  "adapter",
  "spare",
  "part",
  "kit",
  "case",
  "mount",
  "screw",
  "propeller",
  "blade",
  "fee",
  "fees",
  "service",
  "postage",
  "shipping",
  "warranty",
  "module",
  "button",
  "dock",
  "conveyor",
  "stand",
  "sensor",
  "alarm",
  "bracket",
  "plate",
  "cover",
  "mat",
  "hand",
  "gripper",
  "rail",
  "chassis",
  "toolbox",
  "software",
  "licence",
  "license",
  "release",
  // Chinese marketplace and brand-shop titles use these for the same noise.
  "电池",
  "充电",
  "充电器",
  "电机",
  "舵机",
  "控制器",
  "遥控",
  "激光雷达",
  "摄像头",
  "相机",
  "线缆",
  "转接",
  "备件",
  "配件",
  "外壳",
  "支架",
  "螺丝",
  "桨叶",
  "运费",
  "保修",
  "模块",
  "底座",
  "传感器",
  "夹爪",
  "导轨",
  "底盘",
];

export function isAccessory(product) {
  const haystack = normalizeTag([product?.name, product?.category].filter(Boolean).join(" "));
  return ACCESSORY_KEYWORDS.some((keyword) => haystack.includes(normalizeTag(keyword)));
}

/** Keyword table -> model type. First matches win; a model may have several. */
export const TYPE_KEYWORDS = {
  humanoid: ["humanoid", "biped", "android", "гуманоид", "atlas", "optimus", "digit", "figure", "人形", "双足", "仿人"],
  quadruped: ["quadruped", "legged", "robot dog", "anyMal", "spot", "go2", "b2", "unitree b", "四足", "机器狗"],
  cobot: ["cobot", "collaborative", "кобот", "ur3", "ur5", "ur10", "ur16", "ur20", "ur30", "doosan", "协作机器人", "协作机械臂"],
  manipulator: ["robotic arm", "robot arm", "manipulator", "манипулятор", "panda", "franka", "kr 6", "openmanipulator", "scara", "gripper", "机械臂", "机械手", "六轴", "七轴"],
  amr: ["amr", "autonomous mobile", "mobile robot", "mir", "tug", "склад", "agv", "forklift", "移动机器人", "搬运机器人", "叉车"],
  exoskeleton: ["exoskeleton", "экзоскелет", "外骨骼"],
  drone: ["drone", "uav", "квадрокоптер", "无人机", "四旋翼"],
  soft: ["soft robot", "soft gripper", "мягк", "mgrip", "软体机器人", "软体抓手"],
};

/**
 * A keyword hit inside a normalized haystack. Latin keywords match whole words
 * (plus a plural `s`) so `digit` does not fire on `digital` and `spot` does not
 * fire on `spotlight`; Cyrillic and CJK keep substring matching because Russian
 * inflects (`гуманоид` -> `гуманоидный`) and Chinese has no word spaces.
 */
export function keywordIn(haystack, keyword) {
  const k = normalizeTag(keyword);
  if (!k) return false;
  if (/[^\x00-\x7F]/.test(k)) return haystack.includes(k);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}s?(?=\\s|$)`).test(haystack);
}

/** Types a harvested model belongs to, from name, category and description. */
export function detectTypes(product) {
  const haystack = normalizeTag(
    [product?.name, product?.category, product?.description?.slice(0, 200)].filter(Boolean).join(" "),
  );
  const types = [];
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => keywordIn(haystack, keyword))) types.push(type);
  }
  return types.sort();
}

function ruleTags(rule) {
  return String(rule?.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Rules document: `{ items: [{ kind: brand|type|model, match, tags }] }`.
 * A model rule wins outright; otherwise brand + type rules are unioned.
 */
export function mapProduct(product, { rules = [], siteCanons = [], aliases = {} } = {}) {
  const index = buildAliasIndex(aliases);
  const canon = new Set(siteCanons);
  const brand = normalizeTag(product?.brand ?? "");
  const name = normalizeTag(product?.name ?? "");
  const sku = normalizeTag(product?.sku ?? "");
  const types = detectTypes(product);

  const matched = [];
  const collected = [];
  let typeHint = "";

  for (const rule of rules ?? []) {
    const kind = String(rule?.kind ?? "").toLowerCase();
    const match = normalizeTag(rule?.match ?? "");
    if (!kind || !match) continue;

    if (kind === "model") {
      if (name.includes(match) || (sku && sku.includes(match))) {
        matched.push({ kind, match });
        collected.push(...ruleTags(rule));
        if (!typeHint && rule?.robot) typeHint = String(rule.robot).toLowerCase();
      }
      continue;
    }
    if (kind === "brand" && brand && brand.includes(match)) {
      matched.push({ kind, match });
      collected.push(...ruleTags(rule));
      continue;
    }
    if (kind === "type" && types.includes(match)) {
      matched.push({ kind, match });
      collected.push(...ruleTags(rule));
    }
  }

  const modelHit = matched.some((item) => item.kind === "model");
  const canonical = (modelHit
    ? matched
        .filter((item) => item.kind === "model")
        .flatMap((item) => {
          const rule = rules.find(
            (candidate) =>
              String(candidate?.kind).toLowerCase() === "model" &&
              normalizeTag(candidate?.match) === item.match,
          );
          return ruleTags(rule);
        })
    : collected
  )
    .map((tag) => canonicalTag(tag, index))
    .filter(Boolean);

  const tags = uniqueSorted(canonical.filter((tag) => canon.has(tag)));
  const dropped = uniqueSorted(canonical.filter((tag) => !canon.has(tag)));

  return { tags, dropped, matched, types, typeHint, unmapped: tags.length === 0 };
}

/** Maps a whole harvested index; keeps unmapped and accessory models for the report. */
export function tagIndex({ products = [], rules = [], siteCanons = [], aliases = {} } = {}) {
  const mapped = [];
  const unmapped = [];
  const skipped = [];

  for (const product of products) {
    const result = mapProduct(product, { rules, siteCanons, aliases });
    const knownModel = result.matched.some((item) => item.kind === "model");
    // An explicit model rule outranks the accessory heuristic: an educational
    // kit named in the rules is a robot even though its title says "kit".
    if (isAccessory(product) && !knownModel) {
      skipped.push({ sku: product.sku, name: product.name, reason: "accessory" });
      continue;
    }
    const types = result.types.length > 0 ? result.types : result.typeHint ? [result.typeHint] : [];
    // No robot type and no explicit model rule: a car cover or a software
    // toolbox on a brand shop is not a robot, whatever its page says. A brand
    // rule alone is not enough — accessory pages carry the brand too.
    if (types.length === 0 && !knownModel) {
      skipped.push({ sku: product.sku, name: product.name, reason: "no robot type" });
      continue;
    }
    const row = { ...product, tags: result.tags, dropped: result.dropped, types };
    if (result.unmapped) unmapped.push({ sku: product.sku, name: product.name, brand: product.brand });
    else mapped.push(row);
  }

  mapped.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  unmapped.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  skipped.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  return { products: mapped, unmapped, skipped };
}
