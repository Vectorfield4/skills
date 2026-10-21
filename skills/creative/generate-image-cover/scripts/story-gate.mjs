#!/usr/bin/env node
// Advisory gate over a cover/backdrop `story` before the render spends credits.
//
//   node .opencode/skills/creative/generate-image-cover/scripts/story-gate.mjs <kind> <slug> [--advisory]
//
// Reads the queue record's scene — the structured `visual_config`, flattened to
// a one-line summary, or the deprecated `story` — and asks Jev whether it is
// render-ready: three to five concrete entities, one scene, no readable text, no
// faces. A low answer is a candidate. Exits 1 when the scene is weak (unless
// --advisory), so the cover procedure can re-author before paying Runware;
// without RUNWARE_API_KEY it prints a skip notice and exits 0.

import { askDecisions, hasKey } from "#lib/jev/client.mjs";
import { noulFinding } from "#lib/jev/findings.mjs";
import { noulQuestion } from "#lib/jev/questions.mjs";
import { formatFindings, makeReport } from "#lib/jev/report.mjs";
import { compositionKeyFor } from "../../../../docs/image-prompts/composition.mjs";
import { getEntry } from "../../../../scripts/generation-queue.mjs";

const args = process.argv.slice(2);
const [kind, slug] = args.filter((arg) => !arg.startsWith("--"));
const advisory = args.includes("--advisory");

if (!kind || !slug) {
  console.error("usage: story-gate.mjs <kind> <slug> [--advisory]");
  process.exit(2);
}

const entry = getEntry(kind, slug);
const config = entry?.visual_config;
const scene = config
  ? `composition: ${config.composition ?? compositionKeyFor(slug)}; focal: ${config.focal_element}; glow: ${config.environment_glow}; displays: ${config.display_elements.join("; ")}`
  : entry?.story;
if (!scene) {
  console.log(
    `story-gate: нет visual_config/story для ${kind}:${slug} в content/generation-queue.json.`,
  );
  process.exit(2);
}
if (!hasKey()) {
  console.log("story-gate: пропущено — RUNWARE_API_KEY не задан.");
  process.exit(0);
}

const QUESTIONS = {
  entities: noulQuestion("`story` stages three to five concrete objects or entities."),
  scene: noulQuestion("`story` describes one coherent scene, not several unrelated images."),
  no_text: noulQuestion("`story` can be rendered without any readable text, lettering or logos."),
  no_faces: noulQuestion("`story` avoids recognizable human faces."),
};

const RULES = {
  entities: "STORY_ENTITIES_CANDIDATE",
  scene: "STORY_SCENE_CANDIDATE",
  no_text: "STORY_TEXT_CANDIDATE",
  no_faces: "STORY_FACE_CANDIDATE",
};

const { answers, usage } = await askDecisions({
  state: { story: scene },
  questions: QUESTIONS,
});

const findings = [];
for (const [key, rule] of Object.entries(RULES)) {
  // A strong-yes bar (0.8): fire only on a confident "no", not on a borderline
  // story that already names its entities.
  noulFinding(findings, answers[key], {
    line: 0,
    rule,
    detail: scene.slice(0, 90),
    threshold: 0.8,
  });
}

const report = makeReport({
  kind: "story",
  slug,
  lang: "en",
  file: "content/generation-queue.json",
  units: 1,
  findings,
  usage,
  promptVersion: "jev-cover@1",
});
console.log(`\n${kind}:${slug}  [story]`);
console.log(formatFindings(report));
console.log(`· tokens: ${usage.input_tokens} in / ${usage.output_tokens} out`);
process.exit(!advisory && findings.length ? 1 : 0);
