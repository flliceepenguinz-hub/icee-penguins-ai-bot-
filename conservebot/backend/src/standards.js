/**
 * Preservation standards (configurable per artifact type).
 *
 * This is intentionally small + readable: it’s a prototype for demos.
 * In a real system you might load these from a database or a standards file.
 */

export const ARTIFACT_TYPES = /** @type {const} */ ([
  "FOSSILS",
  "ORGANIC",
  "METALLIC",
  "STONE",
]);

/**
 * Range helpers:
 * - "safe" is the ideal range
 * - "warn" is an early-warning buffer (yellow)
 * - Values outside "warn" are considered "danger" (red)
 */
export const STANDARDS_BY_TYPE = {
  FOSSILS: {
    label: "Fossils",
    temperatureC: { safe: [16, 22], warn: [15, 23] },
    humidityPct: { safe: [40, 55], warn: [35, 60] },
    moisturePct: { safeMax: 5, warnMax: 6 },
    access: { maxOpensPerHourSafe: 2, maxOpensPerHourWarn: 4 },
    vibration: { safeMax: 0.25, warnMax: 0.5 }, // normalized 0..1
  },
  ORGANIC: {
    label: "Organic (wood/bone/textile)",
    temperatureC: { safe: [16, 20], warn: [15, 22] },
    humidityPct: { safe: [45, 55], warn: [40, 60] },
    moisturePct: { safeMax: 4, warnMax: 5 },
    access: { maxOpensPerHourSafe: 1, maxOpensPerHourWarn: 3 },
    vibration: { safeMax: 0.2, warnMax: 0.4 },
  },
  METALLIC: {
    label: "Metallic artifacts",
    temperatureC: { safe: [16, 22], warn: [15, 23] },
    humidityPct: { safe: [35, 45], warn: [30, 50] }, // keep metals drier
    moisturePct: { safeMax: 3, warnMax: 4 },
    access: { maxOpensPerHourSafe: 1, maxOpensPerHourWarn: 3 },
    vibration: { safeMax: 0.25, warnMax: 0.5 },
  },
  STONE: {
    label: "Stone artifacts",
    temperatureC: { safe: [16, 24], warn: [15, 26] },
    humidityPct: { safe: [40, 60], warn: [35, 65] },
    moisturePct: { safeMax: 6, warnMax: 7 },
    access: { maxOpensPerHourSafe: 3, maxOpensPerHourWarn: 6 },
    vibration: { safeMax: 0.3, warnMax: 0.6 },
  },
};

export function getStandards(artifactType) {
  return STANDARDS_BY_TYPE[artifactType] ?? STANDARDS_BY_TYPE.FOSSILS;
}

