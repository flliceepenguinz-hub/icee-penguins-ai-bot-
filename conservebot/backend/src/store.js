import { clamp } from "./utils.js";

/**
 * Tiny in-memory store for a demo.
 *
 * - `live` holds the latest reading + AI assessment
 * - `history24h` is 24 hours of 1-minute points
 * - `history7d` is 7 days of 30-minute points
 * - `logs` stores “what happened” (alerts + auto-remediation)
 */
export class Store {
  constructor() {
    this.live = null;
    this.history24h = [];
    this.history7d = [];
    this.logs = [];
  }

  setHistory({ history24h, history7d }) {
    this.history24h = history24h;
    this.history7d = history7d;
  }

  setLive(snapshot) {
    this.live = snapshot;
  }

  pushLog(entry) {
    // Keep logs bounded for memory safety (demo friendly).
    this.logs.push(entry);
    const max = 500;
    if (this.logs.length > max) this.logs.splice(0, this.logs.length - max);
  }

  getHistory(range) {
    if (range === "7d") return this.history7d;
    return this.history24h;
  }

  appendToHistory(range, point) {
    const arr = range === "7d" ? this.history7d : this.history24h;
    arr.push(point);
    const max = range === "7d" ? 400 : 2000;
    if (arr.length > max) arr.splice(0, arr.length - max);
  }

  getLogs(limit = 50) {
    const safeLimit = clamp(Number(limit) || 50, 1, 500);
    return this.logs.slice(-safeLimit).reverse();
  }
}

