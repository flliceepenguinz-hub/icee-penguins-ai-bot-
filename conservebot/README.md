## ConserveBot (mock full-stack prototype)

ConserveBot is a demo app that pretends we have a **sensor-enabled artifact preservation safe box**. It generates realistic mock sensor readings, watches them against preservation standards, then shows:

- **Live sensor readings** (temperature, humidity, moisture, access, vibration)
- **Preservation thresholds** (green/yellow/red)
- **Conservation risk score (0–100)** per artifact type
- **“What ConserveBot is thinking”** (explainable insights)
- **Auto-remediation actions** (simulated + logged)

This is a **prototype for demos**, not production software.

### How to run it

Open **two terminals**.

#### 1) Start the backend (simulator + AI logic)

```bash
cd /workspace/conservebot/backend
npm run dev
```

The backend runs on `http://localhost:3001` and streams live data on `ws://localhost:3001/ws`.

#### 2) Start the frontend (dashboard)

```bash
cd /workspace/conservebot/frontend
npm run dev
```

Then open the dashboard at the URL Vite prints (usually `http://localhost:5173`).

### Demo modes (use the dropdown in the dashboard)

- **normal**: stable “safe” conditions
- **atRisk**: conditions drift toward unsafe ranges
- **remediation**: starts unsafe so ConserveBot quickly triggers auto-remediation actions

### Risk score (0–100)

ConserveBot computes a **risk score** each second from:

- how far values are from safe thresholds
- how fast risky trends are moving (like humidity rising)
- exposure signals (door opens/hour, door currently open)
- vibration spikes

Higher score means “if this continues, damage becomes more likely”.

### Backend API (optional)

- `GET /api/status` – latest live reading + risk score + standards
- `GET /api/history?range=24h|7d` – historical mock data
- `POST /api/config` – set `{ artifactType, demoMode }`
- `GET /api/logs` – auto-remediation + config logs

