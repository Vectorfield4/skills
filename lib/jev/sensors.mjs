// Phase 4 semantic sensors: decompose a critic's axes into atomic `noul`
// questions. A sensor is declarative — the engine builds its questions and maps
// its answers back to findings; the domain owns the rubrics.
//
// A sensor states a desirable property, so a high `answer.noul` is good. The
// corridors in `THRESHOLDS.sensor` turn it into a finding: a confident problem
// (`p ≤ fail`) is a `fail`-severity candidate, the gray zone (`p ≤ review`) is a
// `review`-severity `<rule>_UNSURE`, and above `review` the sensor is clean.
//
// Shapes:
//   { id, rule, scope: "unit", instruction, criteria?, needs? }
//        one question per unit; `{{i}}` in `instruction` becomes the unit index.
//   { id, rule, scope: "document", instruction, criteria?, needs? }
//        one question over the whole document/state.
// `needs` lists state fields a sensor requires; the domain filters them out when
// a field is absent, so an article-only sensor never runs on a service.

import { noulQuestion } from "./questions.mjs";
import { THRESHOLDS } from "./thresholds.mjs";

/** Keep only the sensors whose `needs` fields are present in `state`. */
export function availableSensors(sensors, state) {
  return sensors.filter((sensor) => (sensor.needs ?? []).every((field) => state[field]));
}

const unitKey = (id, i) => `su_${id}_${i}`;
const docKey = (id) => `sd_${id}`;

/** Build the `noul` questions for a sensor list over `unitCount` units. */
export function sensorQuestions(sensors, unitCount) {
  const questions = {};
  for (const sensor of sensors) {
    if (sensor.scope === "unit") {
      for (let i = 0; i < unitCount; i += 1) {
        questions[unitKey(sensor.id, i)] = noulQuestion(
          sensor.instruction.replaceAll("{{i}}", i),
          sensor.criteria,
        );
      }
    } else {
      questions[docKey(sensor.id)] = noulQuestion(sensor.instruction, sensor.criteria);
    }
  }
  return questions;
}

/** Map a sensor's answers back into findings with the sensor corridors. */
export function collectSensorFindings(sensors, units, answers, findings) {
  const { fail, review } = THRESHOLDS.sensor;
  // Sensors are `advisory` in v1: they are reported and forwarded to the critic,
  // but the corridor calibration is not yet proven, so they do not move the
  // verdict. Promote to `fail`/`review` only after the calibration pass.
  const push = (answer, line, sensor, detail) => {
    if (!answer) return;
    const p = answer.noul;
    if (p <= fail) {
      findings.push({ line, rule: sensor.rule, confidence: p, detail, severity: "advisory" });
    } else if (p <= review) {
      findings.push({
        line,
        rule: `${sensor.rule}_UNSURE`,
        confidence: p,
        detail,
        severity: "advisory",
      });
    }
  };
  for (const sensor of sensors) {
    if (sensor.scope === "unit") {
      units.forEach((unit, i) => {
        push(answers[unitKey(sensor.id, i)], unit.line, sensor, unit.text.slice(0, 90));
      });
    } else {
      push(answers[docKey(sensor.id)], 1, sensor, sensor.id);
    }
  }
}
