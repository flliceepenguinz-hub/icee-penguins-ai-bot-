import { clamp, isBetweenInclusive, slope } from "./utils.js";

/**
 * ConserveBot “AI” (explainable rules + scoring).
 *
 * Output:
 * - `riskScore` (0..100): higher = more likely damage if conditions persist
 * - `insights`: human-readable “what it’s thinking”
 * - `actions`: simulated auto-remediation actions
 */

function rangeStatus(x, { safe, warn }) {
  if (isBetweenInclusive(x, safe)) return "safe";
  if (isBetweenInclusive(x, warn)) return "warn";
  return "danger";
}

function maxStatus(x, { safeMax, warnMax }) {
  if (x <= safeMax) return "safe";
  if (x <= warnMax) return "warn";
  return "danger";
}

function statusToColor(status) {
  if (status === "safe") return "green";
  if (status === "warn") return "yellow";
  return "red";
}

function riskFromRange(x, { safe, warn }) {
  // 0 in safe, 25..60 in warn band, 70..100 outside warn
  if (isBetweenInclusive(x, safe)) return 0;
  if (isBetweenInclusive(x, warn)) {
    const [w0, w1] = warn;
    const [s0, s1] = safe;
    // distance from nearest safe bound within warn range
    const d = x < s0 ? s0 - x : x > s1 ? x - s1 : 0;
    const maxD = x < s0 ? s0 - w0 : w1 - s1;
    const t = maxD > 0 ? clamp(d / maxD, 0, 1) : 1;
    return 25 + 35 * t;
  }
  // outside warn
  const [w0, w1] = warn;
  const d = x < w0 ? w0 - x : x > w1 ? x - w1 : 0;
  const t = clamp(d / 5, 0, 1); // 5 units past warn ~ maxed
  return 70 + 30 * t;
}

function riskFromMax(x, { safeMax, warnMax }) {
  if (x <= safeMax) return 0;
  if (x <= warnMax) {
    const t = clamp((x - safeMax) / Math.max(0.001, warnMax - safeMax), 0, 1);
    return 25 + 35 * t;
  }
  const t = clamp((x - warnMax) / 3, 0, 1);
  return 70 + 30 * t;
}

function riskLevel(score) {
  if (score < 30) return "LOW";
  if (score < 60) return "MEDIUM";
  if (score < 80) return "HIGH";
  return "CRITICAL";
}

/**
 * Predict “time to harm” style messages (simple heuristic).
 * Returns null if no prediction is appropriate.
 */
function predictionForHumidity({ humidityPct, humidityStatus, humiditySlopePerMin }) {
  if (humidityStatus === "danger" && humidityPct >= 60) {
    // High humidity + rising = mold risk soon for many organics
    const rising = humiditySlopePerMin > 0.05;
    return rising ? "Humidity rising fast—risk of mold formation within ~6 hours." : "High humidity—mold risk increases over the next day.";
  }
  if (humidityStatus === "warn" && humiditySlopePerMin > 0.05) {
    return "Humidity trending upward—keep an eye on mold/corrosion risk.";
  }
  return null;
}

export class DecisionEngine {
  constructor() {
    // Keep a small window of recent readings for trend detection
    this.recent = []; // [{tMs, reading}]
  }

  ingest(reading) {
    const tMs = Date.parse(reading.timestamp);
    this.recent.push({ tMs, reading });
    const cutoff = tMs - 15 * 60_000; // last 15 minutes
    this.recent = this.recent.filter((p) => p.tMs >= cutoff);
  }

  evaluate({ reading, standards }) {
    const tempStatus = rangeStatus(reading.temperatureC, standards.temperatureC);
    const humidityStatus = rangeStatus(reading.humidityPct, standards.humidityPct);
    const moistureStatus = maxStatus(reading.moisturePct, standards.moisturePct);

    const accessStatus = (() => {
      if (reading.opensPerHour <= standards.access.maxOpensPerHourSafe) return "safe";
      if (reading.opensPerHour <= standards.access.maxOpensPerHourWarn) return "warn";
      return "danger";
    })();

    const vibrationStatus = (() => {
      if (reading.vibration <= standards.vibration.safeMax) return "safe";
      if (reading.vibration <= standards.vibration.warnMax) return "warn";
      return "danger";
    })();

    // Trend (humidity slope over last ~10 minutes)
    const humidityPoints = this.recent.map((p) => ({ t: p.tMs, y: p.reading.humidityPct }));
    const humiditySlopePerSec = slope(humidityPoints);
    const humiditySlopePerMin = humiditySlopePerSec * 60;

    // Base risk contributions
    const riskTemp = riskFromRange(reading.temperatureC, standards.temperatureC);
    const riskHumidity = riskFromRange(reading.humidityPct, standards.humidityPct);
    const riskMoisture = riskFromMax(reading.moisturePct, standards.moisturePct);
    const riskAccess = clamp(
      (reading.opensPerHour / Math.max(1, standards.access.maxOpensPerHourWarn)) * 60,
      0,
      100,
    );
    const riskVibration = clamp((reading.vibration / Math.max(0.01, standards.vibration.warnMax)) * 60, 0, 100);

    // Weighted total
    let riskScore =
      riskTemp * 0.22 +
      riskHumidity * 0.28 +
      riskMoisture * 0.22 +
      riskAccess * 0.16 +
      riskVibration * 0.12;

    // Trend amplifiers
    if (humiditySlopePerMin > 0.08) riskScore += 8;
    if (humiditySlopePerMin > 0.15) riskScore += 12;
    if (reading.doorState === "open") riskScore += 4;
    if (reading.accessLocked) riskScore -= 3; // locked reduces exposure risk a bit

    riskScore = clamp(Math.round(riskScore), 0, 100);

    const insights = [];
    const prediction = predictionForHumidity({ humidityPct: reading.humidityPct, humidityStatus, humiditySlopePerMin });
    if (prediction) insights.push(prediction);

    if (tempStatus !== "safe") {
      insights.push(
        `Temperature is ${tempStatus.toUpperCase()} (${reading.temperatureC}°C). Target ${standards.temperatureC.safe[0]}–${standards.temperatureC.safe[1]}°C.`,
      );
    }
    if (humidityStatus !== "safe") {
      insights.push(
        `Humidity is ${humidityStatus.toUpperCase()} (${reading.humidityPct}%). Target ${standards.humidityPct.safe[0]}–${standards.humidityPct.safe[1]}%.`,
      );
    }
    if (moistureStatus !== "safe") {
      insights.push(
        `Moisture content is ${moistureStatus.toUpperCase()} (${reading.moisturePct}%). Goal <${standards.moisturePct.safeMax}%.`,
      );
    }
    if (accessStatus !== "safe") {
      insights.push(
        `Repeated access detected (${reading.opensPerHour} opens/hour). Exposure risk increased.`,
      );
    }
    if (vibrationStatus !== "safe") {
      insights.push(
        `Vibration is ${vibrationStatus.toUpperCase()} (level ${reading.vibration}). Movement can chip or crack fragile material.`,
      );
    }

    // Keep it friendly and short if everything is okay
    if (!insights.length) insights.push("All conditions look stable. ConserveBot is just monitoring.");

    // Auto-remediation: pick actions when in danger (and sometimes warn)
    const actions = [];
    if (humidityStatus === "danger" || (humidityStatus === "warn" && reading.humidityPct > standards.humidityPct.safe[1])) {
      actions.push({
        type: "DEHUMIDIFY",
        label: "Trigger dehumidification",
        reason: `Humidity ${reading.humidityPct}% above target.`,
      });
      actions.push({
        type: "TRIGGER_AIRFLOW",
        label: "Increase airflow",
        reason: "Airflow helps stabilize humidity and moisture.",
      });
    } else if (humidityStatus === "warn" && reading.humidityPct < standards.humidityPct.safe[0]) {
      actions.push({
        type: "HUMIDIFY",
        label: "Add gentle humidification",
        reason: `Humidity ${reading.humidityPct}% below target.`,
      });
    }

    if (tempStatus === "danger" || tempStatus === "warn") {
      const mid = (standards.temperatureC.safe[0] + standards.temperatureC.safe[1]) / 2;
      const dir = reading.temperatureC > mid ? "DOWN" : "UP";
      actions.push({
        type: dir === "DOWN" ? "ADJUST_TEMP_DOWN" : "ADJUST_TEMP_UP",
        label: dir === "DOWN" ? "Cool internal temperature" : "Warm internal temperature",
        reason: `Temperature ${reading.temperatureC}°C outside ideal zone.`,
      });
    }

    if (accessStatus === "danger") {
      actions.push({
        type: "LOCK_ACCESS_10_MIN",
        label: "Lock access for 10 minutes",
        reason: "Too many door opens—reduce exposure while conditions stabilize.",
      });
    }

    // Don’t over-act: if risk is low, skip actions even if a single metric is warn.
    const finalActions = riskScore >= 45 ? actions : [];

    return {
      riskScore,
      riskLevel: riskLevel(riskScore),
      statuses: {
        temperature: { status: tempStatus, color: statusToColor(tempStatus) },
        humidity: { status: humidityStatus, color: statusToColor(humidityStatus) },
        moisture: { status: moistureStatus, color: statusToColor(moistureStatus) },
        access: { status: accessStatus, color: statusToColor(accessStatus) },
        vibration: { status: vibrationStatus, color: statusToColor(vibrationStatus) },
      },
      trends: {
        humiditySlopePerMin: Number(humiditySlopePerMin.toFixed(3)),
      },
      insights,
      actions: finalActions,
    };
  }
}

