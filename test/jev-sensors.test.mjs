import { describe, expect, it } from "vitest";
import { verdictOf } from "../lib/jev/report.mjs";
import { availableSensors, collectSensorFindings, sensorQuestions } from "../lib/jev/sensors.mjs";
import { sensorStats } from "../lib/prose/harnesses.mjs";
import { SENSORS } from "../lib/prose/sensors.mjs";

/**
 * Offline unit tests for the Phase 4 sensor registry and the circuit-breaker
 * verdict. No network: the question builder and the answer→finding mapping are
 * pure, so a fake answer map exercises them fully (0 Jev tokens).
 */

const units = [
  { text: "First paragraph.", line: 3 },
  { text: "Second paragraph.", line: 7 },
];

describe("sensors: question builder", () => {
  it("builds one keyed question per unit for a unit sensor", () => {
    const sensor = {
      id: "point_first",
      scope: "unit",
      rule: "POINT_BURIED",
      instruction: "`units[{{i}}]` leads with its point.",
    };
    const questions = sensorQuestions([sensor], 2);
    expect(Object.keys(questions)).toEqual(["su_point_first_0", "su_point_first_1"]);
    expect(questions.su_point_first_1.instructions).toContain("units[1]");
    expect(questions.su_point_first_1.type).toBe("noul");
  });

  it("builds one question for a document sensor", () => {
    const sensor = {
      id: "argument_holds",
      scope: "document",
      rule: "ARGUMENT_RESIDUE",
      instruction: "`document` holds one argument.",
    };
    expect(Object.keys(sensorQuestions([sensor], 2))).toEqual(["sd_argument_holds"]);
  });

  it("filters sensors by the state fields they need", () => {
    const sensors = [
      {
        id: "lead_answers_query",
        scope: "document",
        rule: "X",
        needs: ["query"],
        instruction: "q",
      },
      { id: "lead_standalone", scope: "document", rule: "Y", instruction: "s" },
    ];
    expect(availableSensors(sensors, { lead: "l" }).map((s) => s.id)).toEqual(["lead_standalone"]);
    expect(availableSensors(sensors, { lead: "l", query: "q" }).map((s) => s.id)).toEqual([
      "lead_answers_query",
      "lead_standalone",
    ]);
  });
});

describe("sensors: findings and corridors", () => {
  const sensor = { id: "point_first", scope: "unit", rule: "POINT_BURIED", instruction: "x" };
  const run = (answers) => {
    const findings = [];
    collectSensorFindings([sensor], units, answers, findings);
    return findings;
  };

  it("reports an advisory finding below the fail corridor", () => {
    const [finding] = run({ su_point_first_0: { noul: 0.2 } });
    expect(finding).toMatchObject({ rule: "POINT_BURIED", severity: "advisory", line: 3 });
  });

  it("reports an advisory _UNSURE in the gray zone", () => {
    const [finding] = run({ su_point_first_0: { noul: 0.5 } });
    expect(finding).toMatchObject({ rule: "POINT_BURIED_UNSURE", severity: "advisory" });
  });

  it("makes no finding above the review corridor", () => {
    expect(run({ su_point_first_0: { noul: 0.9 } })).toEqual([]);
  });
});

describe("verdict: circuit breaker", () => {
  it("fails on any fail-severity finding", () => {
    expect(
      verdictOf([
        { rule: "X", severity: "review" },
        { rule: "Y", severity: "fail" },
      ]),
    ).toBe("fail");
  });
  it("reviews on gray-zone findings only", () => {
    expect(verdictOf([{ rule: "X_UNSURE", severity: "review" }])).toBe("review");
  });
  it("ignores advisory findings", () => {
    expect(verdictOf([{ rule: "X", severity: "advisory" }])).toBe("clean");
  });
  it("is clean with no findings", () => {
    expect(verdictOf([])).toBe("clean");
  });
});

describe("calibration: precision and recall", () => {
  it("computes precision/recall at a boundary", () => {
    const rows = [
      { sensor: "s", noul: 0.1, label: "real" },
      { sensor: "s", noul: 0.3, label: "false" },
      { sensor: "s", noul: 0.9, label: "real" },
      { sensor: "s", noul: 0.8, label: "false" },
    ];
    const s = sensorStats(rows, 0.35).s;
    expect(s).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1 });
    expect(s.precision).toBe(0.5);
    expect(s.recall).toBe(0.5);
  });

  it("tightening the boundary cuts false positives", () => {
    const rows = [
      { sensor: "s", noul: 0.1, label: "real" },
      { sensor: "s", noul: 0.3, label: "false" },
    ];
    expect(sensorStats(rows, 0.35).s.precision).toBe(0.5);
    expect(sensorStats(rows, 0.2).s.precision).toBe(1);
  });
});

describe("sensors: catalog", () => {
  it("every sensor has a rule and a valid scope", () => {
    for (const sensor of SENSORS) {
      expect(sensor.rule, sensor.id).toBeTruthy();
      expect(["unit", "document"]).toContain(sensor.scope);
    }
  });
});
