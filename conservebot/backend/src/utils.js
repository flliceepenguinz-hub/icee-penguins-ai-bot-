export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(min, max) {
  return lerp(min, max, Math.random());
}

export function randn() {
  // Very small “normal-ish” noise without dependencies.
  // Box-Muller transform
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function nowIso() {
  return new Date().toISOString();
}

export function minutes(ms) {
  return ms * 60_000;
}

export function hours(ms) {
  return ms * 3_600_000;
}

export function isBetweenInclusive(x, [a, b]) {
  return x >= a && x <= b;
}

export function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function slope(points) {
  // points: [{t:number (ms), y:number}]
  if (points.length < 2) return 0;
  const t0 = points[0].t;
  const ts = points.map((p) => (p.t - t0) / 1000); // seconds from start
  const ys = points.map((p) => p.y);
  const tMean = mean(ts);
  const yMean = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < ts.length; i++) {
    num += (ts[i] - tMean) * (ys[i] - yMean);
    den += (ts[i] - tMean) ** 2;
  }
  if (den === 0) return 0;
  return num / den; // y units per second
}

