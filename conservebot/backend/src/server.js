import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

import { Store } from "./store.js";
import { Simulator, DEMO_MODES } from "./simulator.js";
import { ARTIFACT_TYPES, getStandards } from "./standards.js";
import { nowIso } from "./utils.js";
import { DecisionEngine } from "./engine.js";

const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const store = new Store();
const engine = new DecisionEngine();

const config = {
  artifactType: "FOSSILS",
  demoMode: "normal",
};

const simulator = new Simulator(config);
store.setHistory(simulator.generateHistory());

function snapshotForClients() {
  return store.live;
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function logEvent(entry) {
  store.pushLog(entry);
  broadcast({ type: "log", data: entry });
}

function applyActions(actions, reading) {
  for (const action of actions) {
    simulator.applyAction(action.type);
    logEvent({
      id: crypto.randomUUID(),
      timestamp: nowIso(),
      kind: "AUTO_REMEDIATION",
      actionType: action.type,
      label: action.label,
      reason: action.reason,
      context: {
        temperatureC: reading.temperatureC,
        humidityPct: reading.humidityPct,
        moisturePct: reading.moisturePct,
        opensPerHour: reading.opensPerHour,
        vibration: reading.vibration,
      },
    });
  }
}

// --- REST API ---

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ConserveBot backend", time: nowIso() });
});

app.get("/api/artifact-types", (req, res) => {
  res.json({
    artifactTypes: ARTIFACT_TYPES.map((t) => ({
      id: t,
      label: getStandards(t).label,
    })),
    demoModes: DEMO_MODES,
  });
});

app.get("/api/standards", (req, res) => {
  const artifactType = String(req.query.artifactType || config.artifactType);
  res.json({ artifactType, standards: getStandards(artifactType) });
});

app.get("/api/status", (req, res) => {
  res.json({
    config,
    live: store.live,
    standards: getStandards(config.artifactType),
  });
});

app.get("/api/history", (req, res) => {
  const range = String(req.query.range || "24h");
  res.json({ range, points: store.getHistory(range) });
});

app.get("/api/logs", (req, res) => {
  res.json({ logs: store.getLogs(req.query.limit) });
});

app.post("/api/config", (req, res) => {
  const { artifactType, demoMode } = req.body ?? {};
  if (artifactType && !ARTIFACT_TYPES.includes(artifactType)) {
    return res.status(400).json({ error: "Unknown artifactType" });
  }
  if (demoMode && !DEMO_MODES.includes(demoMode)) {
    return res.status(400).json({ error: "Unknown demoMode" });
  }

  if (artifactType) config.artifactType = artifactType;
  if (demoMode) config.demoMode = demoMode;

  simulator.setArtifactType(config.artifactType);
  simulator.setDemoMode(config.demoMode);
  store.setHistory(simulator.generateHistory());

  logEvent({
    id: crypto.randomUUID(),
    timestamp: nowIso(),
    kind: "CONFIG",
    message: `Config updated: artifactType=${config.artifactType}, demoMode=${config.demoMode}`,
  });

  res.json({ ok: true, config });
});

// --- WebSocket ---
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", data: { config, standards: getStandards(config.artifactType) } }));
  const snap = snapshotForClients();
  if (snap) ws.send(JSON.stringify({ type: "tick", data: snap }));
});

// --- Main loop (1Hz) ---
setInterval(() => {
  const reading = simulator.tick();
  engine.ingest(reading);
  const standards = getStandards(config.artifactType);
  const assessment = engine.evaluate({ reading, standards });

  // Apply actions (simulated auto-remediation)
  if (assessment.actions.length) applyActions(assessment.actions, reading);

  const tick = {
    timestamp: reading.timestamp,
    artifactType: config.artifactType,
    demoMode: config.demoMode,
    reading,
    standards,
    assessment, // includes riskScore 0..100
  };

  store.setLive(tick);
  broadcast({ type: "tick", data: tick });

  // Add a slow-roll point to 24h history every minute
  const ms = Date.parse(reading.timestamp);
  if (ms % 60_000 < 1_000) store.appendToHistory("24h", reading);
  if (ms % (30 * 60_000) < 1_000) store.appendToHistory("7d", reading);
}, 1000);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ConserveBot backend listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`WebSocket stream at ws://localhost:${PORT}/ws`);
});

