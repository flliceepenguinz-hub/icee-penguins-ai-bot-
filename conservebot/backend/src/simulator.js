import { clamp, rand, randn } from "./utils.js";
import { getStandards } from "./standards.js";

/**
 * DEMO MODES
 * - normal: stays inside safe ranges with mild noise
 * - atRisk: slowly drifts toward dangerous conditions
 * - remediation: starts bad so auto-remediation triggers quickly
 */
export const DEMO_MODES = /** @type {const} */ ([
  "normal",
  "atRisk",
  "remediation",
]);

function midpoint([a, b]) {
  return (a + b) / 2;
}

/**
 * Simulator produces realistic-ish sensor readings:
 * - temperature/humidity are random walks with drift
 * - moisture follows humidity (slowly)
 * - access is event-based (open/close + frequency)
 * - vibration is usually low with occasional bumps
 */
export class Simulator {
  constructor({ artifactType = "FOSSILS", demoMode = "normal" } = {}) {
    this.artifactType = artifactType;
    this.demoMode = demoMode;

    this.controls = {
      // “Actuators” (what auto-remediation can change)
      tempBiasC: 0,
      humidityBiasPct: 0,
      airflowBoost: 0, // 0..1
      accessLockedUntilMs: 0,
    };

    this._initState();
  }

  setArtifactType(artifactType) {
    this.artifactType = artifactType;
    this._initState();
  }

  setDemoMode(demoMode) {
    this.demoMode = demoMode;
    this._initState();
  }

  applyAction(actionType) {
    // These are “simulation knobs” so actions have visible effect.
    const now = Date.now();
    switch (actionType) {
      case "ADJUST_TEMP_DOWN":
        this.controls.tempBiasC -= 0.15;
        break;
      case "ADJUST_TEMP_UP":
        this.controls.tempBiasC += 0.15;
        break;
      case "DEHUMIDIFY":
        this.controls.humidityBiasPct -= 0.4;
        this.controls.airflowBoost = clamp(this.controls.airflowBoost + 0.2, 0, 1);
        break;
      case "HUMIDIFY":
        this.controls.humidityBiasPct += 0.4;
        break;
      case "TRIGGER_AIRFLOW":
        this.controls.airflowBoost = clamp(this.controls.airflowBoost + 0.25, 0, 1);
        break;
      case "LOCK_ACCESS_10_MIN":
        this.controls.accessLockedUntilMs = Math.max(
          this.controls.accessLockedUntilMs,
          now + 10 * 60_000,
        );
        break;
      default:
        break;
    }
  }

  _initState() {
    const std = getStandards(this.artifactType);
    const baseT = midpoint(std.temperatureC.safe);
    const baseH = midpoint(std.humidityPct.safe);
    const baseM = Math.min(std.moisturePct.safeMax - 0.5, std.moisturePct.safeMax);

    // Starting conditions depend on demo mode
    const start = (() => {
      if (this.demoMode === "remediation") {
        return {
          temperatureC: baseT + rand(2.5, 4.0),
          humidityPct: baseH + rand(8, 15),
          moisturePct: baseM + rand(1.5, 3.0),
        };
      }
      if (this.demoMode === "atRisk") {
        return {
          temperatureC: baseT + rand(0.5, 1.5),
          humidityPct: baseH + rand(3, 6),
          moisturePct: baseM + rand(0.5, 1.2),
        };
      }
      return {
        temperatureC: baseT + rand(-0.4, 0.4),
        humidityPct: baseH + rand(-1.5, 1.5),
        moisturePct: baseM + rand(-0.3, 0.3),
      };
    })();

    this.state = {
      temperatureC: start.temperatureC,
      humidityPct: start.humidityPct,
      moisturePct: start.moisturePct,

      doorState: "closed",
      lastDoorToggleMs: Date.now(),
      opensInLastHour: [], // timestamps (ms) of "open" events

      vibration: 0,
    };
  }

  /**
   * Generates a single reading at `nowMs`.
   */
  tick(nowMs = Date.now()) {
    const std = getStandards(this.artifactType);

    // Drift targets depend on demo mode
    const drift = (() => {
      if (this.demoMode === "atRisk") return { t: +0.004, h: +0.02 };
      if (this.demoMode === "remediation") return { t: -0.002, h: -0.01 }; // let remediation actions pull it down
      return { t: 0, h: 0 };
    })();

    // Temperature: random walk + drift + control bias
    this.state.temperatureC += randn() * 0.03 + drift.t + this.controls.tempBiasC * 0.02;
    // Humidity: random walk + drift + control bias + airflow effect
    const airflowEffect = this.controls.airflowBoost * -0.03;
    this.state.humidityPct +=
      randn() * 0.10 + drift.h + this.controls.humidityBiasPct * 0.03 + airflowEffect;

    // Moisture follows humidity slowly (plus noise)
    const moistureTarget =
      (this.state.humidityPct - midpoint(std.humidityPct.safe)) * 0.04 +
      Math.min(std.moisturePct.safeMax - 0.8, std.moisturePct.safeMax);
    this.state.moisturePct += (moistureTarget - this.state.moisturePct) * 0.02 + randn() * 0.02;

    // Keep in plausible physical bounds
    this.state.temperatureC = clamp(this.state.temperatureC, 5, 35);
    this.state.humidityPct = clamp(this.state.humidityPct, 5, 95);
    this.state.moisturePct = clamp(this.state.moisturePct, 0, 20);

    // Access activity (door open/close)
    const accessLocked = nowMs < this.controls.accessLockedUntilMs;
    const canToggle = nowMs - this.state.lastDoorToggleMs > 10_000; // avoid rapid flicker

    if (!accessLocked && canToggle) {
      const baseChance = this.demoMode === "normal" ? 0.01 : this.demoMode === "atRisk" ? 0.03 : 0.05;
      const toggleChance = this.state.doorState === "closed" ? baseChance : 0.08; // if open, more likely to close
      if (Math.random() < toggleChance) {
        this.state.doorState = this.state.doorState === "closed" ? "open" : "closed";
        this.state.lastDoorToggleMs = nowMs;
        if (this.state.doorState === "open") this.state.opensInLastHour.push(nowMs);
      }
    } else if (accessLocked && this.state.doorState === "open") {
      // if it gets locked while open, close it
      this.state.doorState = "closed";
      this.state.lastDoorToggleMs = nowMs;
    }

    // Remove opens older than 1 hour
    const oneHourAgo = nowMs - 60 * 60_000;
    this.state.opensInLastHour = this.state.opensInLastHour.filter((t) => t >= oneHourAgo);

    // Vibration spikes occasionally
    const bumpChance = this.demoMode === "normal" ? 0.01 : this.demoMode === "atRisk" ? 0.02 : 0.03;
    const bump = Math.random() < bumpChance ? rand(0.3, 0.9) : 0;
    const decay = 0.85;
    this.state.vibration = clamp(this.state.vibration * decay + bump + randn() * 0.01, 0, 1);

    return {
      timestamp: new Date(nowMs).toISOString(),
      temperatureC: Number(this.state.temperatureC.toFixed(2)),
      humidityPct: Number(this.state.humidityPct.toFixed(1)),
      moisturePct: Number(this.state.moisturePct.toFixed(2)),
      doorState: this.state.doorState,
      opensPerHour: this.state.opensInLastHour.length,
      vibration: Number(this.state.vibration.toFixed(2)),
      accessLocked,
    };
  }

  /**
   * Create mock historical data (24h @ 1min, 7d @ 30min).
   * These are “pre-baked” so the dashboard looks full right away.
   */
  generateHistory() {
    const now = Date.now();

    const history24h = [];
    for (let i = 24 * 60; i >= 0; i--) {
      history24h.push(this.tick(now - i * 60_000));
    }

    const history7d = [];
    for (let i = 7 * 48; i >= 0; i--) {
      history7d.push(this.tick(now - i * 30 * 60_000));
    }

    return { history24h, history7d };
  }
}

