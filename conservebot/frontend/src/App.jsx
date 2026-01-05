import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { getJson, postJson } from './api'
import { RiskGauge } from './components/RiskGauge'

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function metricPill(color, label) {
  return <span className={`pill ${color}`}>{label}</span>
}

function MetricCard({ title, value, unit, statusColor, statusText, rangeText }) {
  return (
    <div className="metricCard">
      <div className="metricTop">
        <div className="metricName">{title}</div>
        {metricPill(statusColor, statusText)}
      </div>
      <div className="metricValue">
        {value}
        <span className="tiny"> {unit}</span>
      </div>
      <div className="metricRange">{rangeText}</div>
    </div>
  )
}

function App() {
  const [artifactTypes, setArtifactTypes] = useState([])
  const [demoModes, setDemoModes] = useState([])

  const [artifactType, setArtifactType] = useState('FOSSILS')
  const [demoMode, setDemoMode] = useState('normal')
  const [range, setRange] = useState('24h')

  const [standards, setStandards] = useState(null)
  const [tick, setTick] = useState(null)
  const [history, setHistory] = useState([])
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  const wsRef = useRef(null)

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const types = await getJson('/api/artifact-types')
        const status = await getJson('/api/status')
        const hist = await getJson(`/api/history?range=${range}`)
        const logRes = await getJson('/api/logs?limit=30')

        if (cancelled) return
        setArtifactTypes(types.artifactTypes)
        setDemoModes(types.demoModes)
        setArtifactType(status.config.artifactType)
        setDemoMode(status.config.demoMode)
        setStandards(status.standards)
        setTick(status.live)
        setHistory(hist.points)
        setLogs(logRes.logs)
      } catch (e) {
        setError(String(e?.message || e))
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh history when range changes
  useEffect(() => {
    let cancelled = false
    async function loadRange() {
      try {
        const hist = await getJson(`/api/history?range=${range}`)
        if (cancelled) return
        setHistory(hist.points)
      } catch (e) {
        setError(String(e?.message || e))
      }
    }
    loadRange()
    return () => {
      cancelled = true
    }
  }, [range])

  // WebSocket live stream
  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'hello') {
          setStandards(msg.data.standards)
          setArtifactType(msg.data.config.artifactType)
          setDemoMode(msg.data.config.demoMode)
        }
        if (msg.type === 'tick') {
          setTick(msg.data)
          setStandards(msg.data.standards)
        }
        if (msg.type === 'log') {
          setLogs((prev) => [msg.data, ...prev].slice(0, 30))
        }
      } catch {
        // ignore
      }
    }

    ws.onerror = () => setError('WebSocket error (is the backend running on :3001?)')
    return () => ws.close()
  }, [])

  async function applyConfig(next) {
    try {
      await postJson('/api/config', next)
      const status = await getJson('/api/status')
      const hist = await getJson(`/api/history?range=${range}`)
      setStandards(status.standards)
      setTick(status.live)
      setHistory(hist.points)
      setError('')
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  const reading = tick?.reading
  const assessment = tick?.assessment

  const chartData = useMemo(() => {
    // Recharts wants consistent keys. Use history + latest tick.
    const pts = [...history]
    if (reading) pts.push(reading)
    return pts.map((p) => ({
      t: new Date(p.timestamp).getTime(),
      time: new Date(p.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      temperatureC: p.temperatureC,
      humidityPct: p.humidityPct,
      moisturePct: p.moisturePct,
    }))
  }, [history, reading])

  return (
    <div className="appShell">
      <div className="topBar">
        <div className="brand">
          <div className="brandTitle">ConserveBot</div>
          <div className="brandSub">AI-assisted monitoring + auto-remediation for artifact preservation safe boxes (mock prototype)</div>
        </div>
        <div className="controls">
          <div className="control">
            <label>Artifact type</label>
            <select
              value={artifactType}
              onChange={(e) => {
                const next = e.target.value
                setArtifactType(next)
                applyConfig({ artifactType: next })
              }}
            >
              {artifactTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control">
            <label>Demo mode</label>
            <select
              value={demoMode}
              onChange={(e) => {
                const next = e.target.value
                setDemoMode(next)
                applyConfig({ demoMode: next })
              }}
            >
              {demoModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="control">
            <label>History range</label>
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="panel">
          <div className="panelTitle">Connection note</div>
          <div className="panelMeta">{error}</div>
        </div>
      ) : null}

      <div className="grid">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Real-time conditions</div>
            <div className="panelMeta">
              Last update: <b>{fmtTime(tick?.timestamp)}</b> • Door: <b>{reading?.doorState || '—'}</b> • Opens/hr: <b>{reading?.opensPerHour ?? '—'}</b>
            </div>
          </div>

          <div className="cards">
            <MetricCard
              title="Temperature"
              value={reading?.temperatureC ?? '—'}
              unit="°C"
              statusColor={assessment?.statuses?.temperature?.color || 'green'}
              statusText={assessment?.statuses?.temperature?.status?.toUpperCase() || '—'}
              rangeText={
                standards
                  ? `Safe ${standards.temperatureC.safe[0]}–${standards.temperatureC.safe[1]}°C (warn ${standards.temperatureC.warn[0]}–${standards.temperatureC.warn[1]}°C)`
                  : '—'
              }
            />
            <MetricCard
              title="Humidity"
              value={reading?.humidityPct ?? '—'}
              unit="%"
              statusColor={assessment?.statuses?.humidity?.color || 'green'}
              statusText={assessment?.statuses?.humidity?.status?.toUpperCase() || '—'}
              rangeText={
                standards
                  ? `Safe ${standards.humidityPct.safe[0]}–${standards.humidityPct.safe[1]}% (warn ${standards.humidityPct.warn[0]}–${standards.humidityPct.warn[1]}%)`
                  : '—'
              }
            />
            <MetricCard
              title="Moisture"
              value={reading?.moisturePct ?? '—'}
              unit="%"
              statusColor={assessment?.statuses?.moisture?.color || 'green'}
              statusText={assessment?.statuses?.moisture?.status?.toUpperCase() || '—'}
              rangeText={standards ? `Goal <${standards.moisturePct.safeMax}% (warn <${standards.moisturePct.warnMax}%)` : '—'}
            />
            <MetricCard
              title="Access activity"
              value={reading?.opensPerHour ?? '—'}
              unit="opens/hr"
              statusColor={assessment?.statuses?.access?.color || 'green'}
              statusText={assessment?.statuses?.access?.status?.toUpperCase() || '—'}
              rangeText={
                standards
                  ? `Safe ≤${standards.access.maxOpensPerHourSafe}/hr (warn ≤${standards.access.maxOpensPerHourWarn}/hr)`
                  : '—'
              }
            />
            <MetricCard
              title="Vibration"
              value={reading?.vibration ?? '—'}
              unit="(0–1)"
              statusColor={assessment?.statuses?.vibration?.color || 'green'}
              statusText={assessment?.statuses?.vibration?.status?.toUpperCase() || '—'}
              rangeText={standards ? `Safe ≤${standards.vibration.safeMax} (warn ≤${standards.vibration.warnMax})` : '—'}
            />
            <div className="metricCard">
              <div className="metricTop">
                <div className="metricName">Conservation risk score</div>
                {metricPill(
                  assessment?.riskScore >= 80 ? 'red' : assessment?.riskScore >= 60 ? 'yellow' : 'green',
                  assessment?.riskLevel || '—',
                )}
              </div>
              <RiskGauge riskScore={assessment?.riskScore ?? 0} riskLevel={assessment?.riskLevel || 'LOW'} />
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="panelHeader">
            <div className="panelTitle">Historical trends ({range})</div>
            <div className="panelMeta">Live point is appended to the end</div>
          </div>

          <div className="chartWrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="time" hide />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.55)" />
                <Tooltip
                  contentStyle={{ background: 'rgba(10,14,22,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
                  labelFormatter={(v, payload) => payload?.[0]?.payload?.time || v}
                />
                <Line yAxisId="left" type="monotone" dataKey="temperatureC" name="Temp (°C)" stroke="#7dd3fc" dot={false} strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="humidityPct" name="Humidity (%)" stroke="#34d399" dot={false} strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="moisturePct" name="Moisture (%)" stroke="#fdb022" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="split">
          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">What ConserveBot is thinking</div>
              <div className="panelMeta">
                Humidity trend: <b>{assessment?.trends?.humiditySlopePerMin ?? '—'}</b>%/min
              </div>
            </div>
            <div className="list">
              {(assessment?.insights || ['—']).slice(0, 8).map((t, idx) => (
                <div className="listItem" key={idx}>
                  <div className="listItemTitle">{t}</div>
                  <div className="listItemSub">Explainable rules + trend scoring (no external AI APIs)</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">Auto-remediation + alerts</div>
              <div className="panelMeta">Latest first</div>
            </div>
            <div className="list">
              {logs.length ? (
                logs.map((l) => (
                  <div className="listItem" key={l.id}>
                    <div className="listItemTitle">{l.label || l.kind}</div>
                    <div className="listItemSub">
                      <b>{fmtTime(l.timestamp)}</b> — {l.reason || l.message || ''}
                    </div>
                  </div>
                ))
              ) : (
                <div className="listItem">
                  <div className="listItemTitle">No actions yet</div>
                  <div className="listItemSub">Switch demo mode to “remediation” to trigger actions quickly.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
