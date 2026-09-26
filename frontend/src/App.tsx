import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Overview, { type OverviewData } from './Overview'
import './App.css'

type Session = { username: string; csrf_token: string }
type Run = {
  id: string
  ticker: string
  analysis_date: string
  depth: number | string
  status: string
  rating: string
  created_at: string
  elapsed_seconds?: number | string
  sections?: Record<string, string>
}
type Job = {
  id: string
  ticker: string
  analysis_date: string
  depth: number | string
  status: string
  elapsed_seconds: number
  error?: string
}
type LiveEvent = { message: string; eventType?: string }
type ActiveJob = Job & { events: LiveEvent[]; connection?: 'connecting' | 'live' | 'reconnecting' | 'disconnected' }

const tickers = ['AMD', 'CRWD', 'PANW', 'AVGO', 'MU', 'SPY']
const depths = [
  { value: 1, name: 'Quick', meaning: 'Quick research, few debate and strategy discussion rounds' },
  { value: 3, name: 'Medium', meaning: 'Middle ground, moderate debate rounds and strategy discussion' },
  { value: 5, name: 'Deep', meaning: 'Comprehensive research, in depth debate and strategy discussion' },
]
const labels: Record<string, string> = {
  market_report: 'Market Analyst',
  sentiment_report: 'Sentiment Analyst',
  news_report: 'News Analyst',
  fundamentals_report: 'Fundamentals Analyst',
  investment_plan: 'Research Decision',
  trader_investment_plan: 'Trading Plan',
  final_trade_decision: 'Portfolio Verdict',
  complete_report: 'Complete Report',
}
const terminalStatuses = new Set(['done', 'failed', 'cancelled'])

function BrandIcon() {
  return <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <line x1="2" x2="22" y1="12" y2="12" />
    <line x1="12" x2="12" y1="2" y2="22" />
    <path d="m20 16-4-4 4-4" /><path d="m4 8 4 4-4 4" />
    <path d="m16 4-4 4-4-4" /><path d="m8 20 4-4 4 4" />
  </svg>
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLogin(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-shell">
    <form className="login-card" onSubmit={submit}>
      <div className="brand-mark"><BrandIcon /></div>
      <div className="eyebrow">PRIVATE ANALYSIS NODE</div>
      <h1>TradingAgents</h1>
      <p>Sign in to the research console.</p>
      <label>Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button disabled={busy}>{busy ? 'AUTHENTICATING…' : 'SIGN IN'}</button>
    </form>
  </main>
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [runs, setRuns] = useState<Run[]>([])
  const historyRequest = useRef(0)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const overviewRequest = useRef(0)
  const [selected, setSelected] = useState<Run | null>(null)
  const openRunRequest = useRef(0)
  const [ticker, setTicker] = useState('AMD')
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().slice(0, 10))
  const [depth, setDepth] = useState(3)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [jobs, setJobs] = useState<ActiveJob[]>([])
  const [raw, setRaw] = useState(false)
  const [view, setView] = useState<'new' | 'jobs' | 'reports' | 'overview'>('new')
  const [focusedJobId, setFocusedJobId] = useState('')
  const [expandedTicker, setExpandedTicker] = useState('')
  const [removing, setRemoving] = useState<string[]>([])
  const removalPending = useRef(new Set<string>())
  const removedRuns = useRef(new Set<string>())
  const currentFocus = useRef({ view, id: focusedJobId })
  currentFocus.current = { view, id: focusedJobId }
  const focusedJob = jobs.find(job => job.id === focusedJobId) || jobs[0]
  const streams = useRef<Record<string, EventSource>>({})
  const receivedEvents = useRef<Record<string, number>>({})
  const maxDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const groupedRuns = useMemo(() => {
    const groups = new Map<string, Run[]>()
    runs.forEach(run => {
      const name = String(run.ticker || 'Not available').toUpperCase()
      groups.set(name, [...(groups.get(name) || []), run])
    })
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, items]) => [name, items.sort((left, right) =>
        right.analysis_date.localeCompare(left.analysis_date) || right.created_at.localeCompare(left.created_at)
      )] as const)
  }, [runs])

  async function loadOverview() {
    const request = ++overviewRequest.current
    setOverview(null)
    try {
      const snapshot = await api<OverviewData>('/api/overview')
      if (request === overviewRequest.current) setOverview(snapshot)
    } catch (err) {
      if (request === overviewRequest.current) throw err
    }
  }

  async function showOverview() {
    setView('overview')
    setError('')
    try { await loadOverview() }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load dashboard') }
  }

  async function loadHistory() {
    const request = ++historyRequest.current
    const history = await api<Run[]>('/api/runs')
    if (request === historyRequest.current) setRuns(history.filter(run => !removedRuns.current.has(run.id)))
    return history
  }

  async function restoreWorkspace() {
    const [, savedJobs] = await Promise.all([
      loadHistory(),
      api<Job[]>('/api/jobs'),
    ])
    const active = (Array.isArray(savedJobs) ? savedJobs : [])
      .filter(job => job.status === 'queued' || job.status === 'running')
      .map(job => ({ ...job, events: [] }))
    setJobs(active)
    if (active.length) { setFocusedJobId(active[0].id); setView('jobs') }
    active.forEach(monitor)
  }

  useEffect(() => {
    api<Session>('/api/session')
      .then(async value => {
        setSession(value)
        await restoreWorkspace()
      })
      .catch(() => setSession(null))
    return () => Object.values(streams.current).forEach(stream => stream.close())
  }, [])

  async function openRun(run: Pick<Run, 'id'>) {
    if (removalPending.current.has(run.id) || removedRuns.current.has(run.id)) return
    const request = ++openRunRequest.current
    setError('')
    setRaw(false)
    try {
      const report = await api<Run>(`/api/runs/${run.id}`)
      if (request !== openRunRequest.current || removalPending.current.has(report.id) || removedRuns.current.has(report.id)) return
      setSelected(report)
      setView('reports')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open report')
    }
  }

  async function removeRun(run: Run, descriptor: string) {
    if (removalPending.current.has(run.id)) return
    if (!window.confirm(`Remove the ${run.ticker} analysis for ${descriptor} from history? Report files will be kept.`)) return
    removalPending.current.add(run.id)
    setRemoving(current => [...current, run.id])
    setError('')
    try {
      await api(`/api/runs/${run.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': session!.csrf_token },
      })
      removedRuns.current.add(run.id)
      historyRequest.current++
      overviewRequest.current++
      setOverview(null)
      setRuns(current => current.filter(item => item.id !== run.id))
      setSelected(current => current?.id === run.id ? null : current)
      try {
        await loadHistory()
      } catch {
        setError('Report removed, but history could not refresh. Reload to retry.')
      }
      if (currentFocus.current.view === 'overview') {
        try { await loadOverview() }
        catch { setError('Report removed, but the dashboard could not refresh. Reload to retry.') }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove report')
    } finally {
      removalPending.current.delete(run.id)
      setRemoving(current => current.filter(id => id !== run.id))
    }
  }

  function updateJob(id: string, update: Partial<ActiveJob>, liveEvent?: LiveEvent) {
    setJobs(current => current.map(job => job.id === id
      ? { ...job, ...update, events: liveEvent ? [...job.events, liveEvent] : job.events }
      : job))
  }

  async function finishJob(id: string, status: string) {
    streams.current[id]?.close()
    delete streams.current[id]
    if (currentFocus.current.view === 'overview') {
      overviewRequest.current++
      setOverview(null)
    }
    try {
      await loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis finished, but history could not refresh.')
      return
    }
    if (currentFocus.current.view === 'overview') {
      try { await loadOverview() }
      catch (err) { setError(err instanceof Error ? err.message : 'Analysis finished, but the dashboard could not refresh.') }
      return
    }
    if (status === 'done' && currentFocus.current.view === 'jobs' && currentFocus.current.id === id && !removalPending.current.has(id) && !removedRuns.current.has(id)) {
      try {
        const report = await api<Run>(`/api/runs/${id}`)
        if (currentFocus.current.view === 'jobs' && currentFocus.current.id === id && !removalPending.current.has(report.id) && !removedRuns.current.has(report.id)) {
          setSelected(report); setRaw(false); setView('reports')
        }
      } catch {
        setError('Analysis finished, but the saved report could not be opened.')
      }
    }
  }

  function monitor(job: ActiveJob) {
    streams.current[job.id]?.close()
    const stream = new EventSource(`/api/runs/${job.id}/events`)
    streams.current[job.id] = stream
    updateJob(job.id, { connection: 'connecting' })
    stream.onopen = () => {
      updateJob(job.id, { connection: 'live' })
    }
    stream.onmessage = message => {
      try {
        const data = JSON.parse(message.data)
        // Server event IDs are stable append-only indexes. Native EventSource
        // resumes from Last-Event-ID; this also filters replay after a manual
        // reconnect creates a fresh EventSource instance.
        if (data.type !== 'heartbeat' && message.lastEventId) {
          const eventIndex = Number(message.lastEventId)
          if (!Number.isSafeInteger(eventIndex) || eventIndex < 0) return
          const received = receivedEvents.current[job.id] ?? -1
          if (eventIndex <= received) return
          receivedEvents.current[job.id] = eventIndex
        }
        const liveEvent = data.message ? {
          message: String(data.message),
          eventType: data.type,
        } : undefined
        updateJob(job.id, { ...data, connection: 'live' }, liveEvent)
        if (terminalStatuses.has(data.status)) void finishJob(job.id, data.status)
      } catch {
        updateJob(job.id, {}, { message: 'Received an unreadable live update.', eventType: 'warning' })
      }
    }
    stream.onerror = () => {
      // CONNECTING is recoverable: leave EventSource open for native retries.
      updateJob(job.id, { connection: stream.readyState === 2 ? 'disconnected' : 'reconnecting' })
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault()
    setError('')
    const symbol = ticker.trim().toUpperCase()
    if (!/^[A-Za-z0-9._\-^=]{1,32}$/.test(symbol)) {
      setError('Enter a valid ticker symbol.')
      return
    }
    if (!analysisDate || analysisDate > maxDate) {
      setError('Choose today or an earlier date.')
      return
    }
    setStarting(true)
    try {
      const response = await api<Partial<Job> & Pick<Job, 'id' | 'status'>>('/api/runs', {
        method: 'POST',
        headers: { 'X-CSRF-Token': session!.csrf_token },
        body: JSON.stringify({ ticker: symbol, analysis_date: analysisDate, depth }),
      })
      const job: ActiveJob = {
        id: response.id,
        ticker: response.ticker || symbol,
        analysis_date: response.analysis_date || analysisDate,
        depth: response.depth ?? depth,
        status: response.status,
        elapsed_seconds: response.elapsed_seconds ?? 0,
        error: response.error,
        events: [],
      }
      setJobs(current => [job, ...current.filter(item => item.id !== job.id)])
      setFocusedJobId(job.id)
      setView('jobs')
      monitor(job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start analysis')
    } finally {
      setStarting(false)
    }
  }

  async function stop(job: ActiveJob) {
    updateJob(job.id, { status: 'cancelling' }, { message: 'Force-stop requested.', eventType: 'control' })
    try {
      const cancelled = await api<Job>(`/api/jobs/${job.id}/cancel`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': session!.csrf_token },
      })
      streams.current[job.id]?.close()
      delete streams.current[job.id]
      updateJob(job.id, cancelled, { message: 'Analysis cancelled.', eventType: 'control' })
      await loadHistory()
    } catch (err) {
      updateJob(job.id, { status: job.status }, {
        message: err instanceof Error ? err.message : 'Unable to stop analysis.',
        eventType: 'error',
      })
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session!.csrf_token } })
    Object.values(streams.current).forEach(stream => stream.close())
    setSession(null)
  }

  if (session === undefined) return <main className="loading">CONNECTING TO ANALYSIS NODE…</main>
  if (!session) return <Login onLogin={value => {
    setSession(value)
    restoreWorkspace().catch(() => setError('Signed in, but the workspace could not be restored.'))
  }} />

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><BrandIcon /></div>
        <div><div className="eyebrow">PRIVATE RESEARCH / MULTI-AGENT FINANCE</div><h1>TradingAgents</h1></div>
      </div>
      <div className="session"><span className="status-dot" aria-hidden="true" /><span>{session.username}</span><button className="ghost" onClick={logout}>Sign out</button></div>
    </header>

    <div className={`workspace view-${view}`}>
      <aside className="command-sidebar" aria-label="Workspace navigation">
        <nav className="workspace-nav" aria-label="Workspace sections">
          <button aria-current={view === 'new' ? 'page' : undefined} onClick={() => setView('new')}>New analysis <span>＋</span></button>
          <button aria-current={view === 'overview' ? 'page' : undefined} onClick={() => void showOverview()}>Analysis dashboard <span>▦</span></button>
          <button aria-current={view === 'jobs' ? 'page' : undefined} onClick={() => setView('jobs')}>Live runs <span>{jobs.filter(job => !terminalStatuses.has(job.status)).length}</span></button>
          <button aria-current={view === 'reports' ? 'page' : undefined} onClick={() => setView('reports')}>Saved reports <span>{runs.length}</span></button>
        </nav>
        <section className="queue-panel" aria-label="Run queue">
          <div className="panel-title">RUN QUEUE <small>{jobs.length}</small></div>
          <div className="queue-list">{jobs.length ? jobs.map(job => <button key={job.id} className={`queue-row ${view === 'jobs' && focusedJob?.id === job.id ? 'selected' : ''}`} aria-label={`Inspect ${job.ticker} ${job.analysis_date} ${job.id}`} aria-pressed={view === 'jobs' && focusedJob?.id === job.id} onClick={() => { setFocusedJobId(job.id); setView('jobs') }}>
            <span><b>{job.ticker}</b><em>{job.status}</em></span>
            <small>{job.analysis_date} · D{job.depth} · {job.elapsed_seconds}s</small>
            <small className="queue-preview">{!terminalStatuses.has(job.status) && job.connection !== 'live' ? `${job.connection || 'connecting'} · last known state` : job.events.at(-1)?.message || 'Waiting for agent output'}</small>
          </button>) : <p className="empty">No runs in this session.</p>}</div>
        </section>
        <section className="history" aria-label="Saved reports">
          <div className="panel-title">RUN HISTORY <small>{runs.length}</small></div>
          <div className="history-list" aria-label="Analysis run history">{groupedRuns.length ? groupedRuns.map(([name, tickerRuns]) => <div className={`ticker-group ${expandedTicker === name ? 'expanded' : ''}`} key={name}>
            <button className="ticker-toggle" aria-label={`Show ${name} report dates`} aria-expanded={expandedTicker === name} onClick={() => setExpandedTicker(current => current === name ? '' : name)}><b>{name}</b><span>{tickerRuns.length}</span></button>
            {expandedTicker === name && <div className="ticker-dates">{tickerRuns.map(run => {
              const repeatedDate = tickerRuns.some(item => item !== run && item.analysis_date === run.analysis_date)
              const descriptor = repeatedDate ? `${run.analysis_date} ${run.created_at || run.id}` : run.analysis_date
              return <div className={selected?.id === run.id && view === 'reports' ? 'history-row selected' : 'history-row'} key={run.id}>
              <button className="history-open" disabled={removing.includes(run.id)} onClick={() => openRun(run)} aria-label={`Open ${name} ${descriptor} report`} aria-pressed={selected?.id === run.id && view === 'reports'}>
                <span><b>{run.analysis_date}</b><small>{repeatedDate ? `${run.created_at || run.id} · ` : ''}{depths.some(item => String(item.value) === String(run.depth)) ? `D${run.depth}` : 'Depth not available'}</small></span>
                <em className={`rating ${String(run.rating).toLowerCase()}`}>{run.rating || 'Not available'}</em>
              </button>
              <button className="history-remove" disabled={removing.includes(run.id)} onClick={() => removeRun(run, descriptor)} aria-label={`Remove ${name} ${descriptor} report`} title="Remove this saved analysis">×</button>
            </div>})}</div>}
          </div>) : <p className="empty">No completed runs.</p>}</div>
        </section>
        <p className="sidebar-note">Research, not financial advice.<br />Review the evidence before acting.</p>
      </aside>

      <main className="output" id="workspace-output">
        <div className="output-bar"><span>RESEARCH DESK / {view === 'new' ? 'SETUP' : view === 'overview' ? 'OVERVIEW' : view === 'jobs' ? 'LIVE ACTIVITY' : 'REPORT READER'}</span><span>{session.username}</span></div>
        {error && <div className="error workspace-error" role="alert">{error}</div>}
        <section className="command-panel" hidden={view !== 'new'} aria-labelledby="setup-title">
          <div className="section-title"><div><span className="section-number">01 / SETUP</span><h2 id="setup-title">Start a research run</h2></div><p>Choose a market target. Existing runs continue independently.</p></div>
          <form onSubmit={start}>
            <div className="grid-two">
              <label>Ticker<input aria-label="Ticker" list="ticker-options" value={ticker} onChange={event => setTicker(event.target.value)} maxLength={32} /><datalist id="ticker-options">{tickers.map(item => <option key={item}>{item}</option>)}</datalist></label>
              <label>Analysis date<input type="date" value={analysisDate} max={maxDate} onChange={event => setAnalysisDate(event.target.value)} /></label>
            </div>
            <fieldset>
              <legend>Research depth</legend>
              <div className="depths">{depths.map(item => <label className={depth === item.value ? 'depth active' : 'depth'} key={item.value}><input type="radio" name="depth" checked={depth === item.value} onChange={() => setDepth(item.value)} /><b>{item.value} / {item.name}</b><span>{item.meaning}</span></label>)}</div>
            </fieldset>
            <button className="run-button" disabled={starting}>{starting ? 'STARTING…' : 'RUN ANALYSIS'}</button>
          </form>
        </section>
        {view === 'overview' && (overview ? <Overview data={overview} onOpenRun={id => openRun({ id })} /> : !error && <p className="empty">Loading saved analyses…</p>)}
        {view === 'jobs' && <section className="active-runs" aria-labelledby="active-runs-title">
          <div className="section-title"><div><span className="section-number">02 / INSPECT</span><h2 id="active-runs-title">Run activity</h2></div><p>Select a run in the queue to inspect its output.</p></div>
          {focusedJob ? <>
            <JobCard key={focusedJob.id} job={focusedJob} onStop={() => stop(focusedJob)} onReconnect={() => monitor(focusedJob)} />
            {focusedJob.status === 'done' && <button className="open-report" onClick={() => openRun({ id: focusedJob.id })}>Open completed report →</button>}
          </> : <p className="empty">No live runs. Start a new analysis to see agent activity here.</p>}
        </section>}
        {view === 'reports' && (selected ? <section className="report-area">
          <div className="report-toolbar"><div><span className="section-number">03 / READ</span><span>{selected.ticker} · SAVED REPORT</span></div><button className="ghost" onClick={() => setRaw(!raw)}>{raw ? 'Rendered view' : 'Raw view'}</button></div>
          <Report run={selected} raw={raw} />
        </section> : <section className="welcome"><span className="eyebrow">REPORT LIBRARY</span><h2>Read the research</h2><p>Select a saved run to review the verdict, analyst evidence, and downloadable reports.</p></section>)}
      </main>
    </div>
  </div>
}

function JobCard({ job, onStop, onReconnect }: { job: ActiveJob; onStop: () => void; onReconnect: () => void }) {
  const stoppable = job.status === 'queued' || job.status === 'running'
  return <article className={`job-card status-${job.status}`}>
    <div className="job-head">
      <div><span className="job-kicker">{job.analysis_date} · DEPTH {job.depth}</span><h3>{job.ticker} analysis</h3></div>
      <span className="status-pill"><span aria-hidden="true" />{job.status.toUpperCase()}</span>
    </div>
    <div className="job-meta"><span>JOB {job.id}</span><code>{job.elapsed_seconds ?? 0}s</code></div>
    {!terminalStatuses.has(job.status) && <div className="connection-status" role="status">
      {job.connection === 'live' ? 'Live connection' : `${job.connection === 'disconnected' ? 'Disconnected' : job.connection === 'reconnecting' ? 'Reconnecting' : 'Connecting'} — showing last received state`}
      {job.connection === 'disconnected' && <button className="ghost" onClick={onReconnect}>Reconnect stream</button>}
    </div>}
    <div className="activity-header"><span>AGENT TIMELINE</span><span>{job.events.length} {job.events.length === 1 ? 'EVENT' : 'EVENTS'}</span></div>
    <div className="activity-stream" role="log" aria-live="polite" aria-label={`${job.ticker} live activity`} tabIndex={0}>
      {job.events.length ? job.events.map((entry, index) => <div className={`activity-line event-${entry.eventType || 'update'}`} key={`${index}-${entry.message}`}>
        <div className="activity-node"><span>{String(index + 1).padStart(2, '0')}</span></div>
        <div className="activity-entry"><b>{String(entry.eventType || 'update').replaceAll('_', ' ')}</b><p>{entry.message}</p></div>
      </div>) : <p className="stream-empty">Waiting for agent output…</p>}
      {job.error && <p className="error">{job.error}</p>}
    </div>
    {stoppable && <button className="stop-button" onClick={onStop} aria-label={`Stop ${job.ticker} analysis`}>Force stop</button>}
  </article>
}

function sectionId(key: string) {
  return `section-${key.replaceAll('_', '-')}`
}

function Report({ run, raw }: { run: Run; raw: boolean }) {
  const sections = Object.entries(run.sections || {})
  return <article className="report">
    <div className="verdict">
      <div><span>FINAL RATING</span><strong className={`rating ${String(run.rating).toLowerCase()}`}>{run.rating || 'Not available'}</strong></div>
      <dl><div><dt>TICKER</dt><dd>{run.ticker || 'Not available'}</dd></div><div><dt>DATE</dt><dd>{run.analysis_date || 'Not available'}</dd></div><div><dt>DEPTH</dt><dd>{run.depth ?? 'Not available'}</dd></div></dl>
    </div>
    {sections.length ? <div className="report-layout">
      <nav className="report-toc" aria-label="Report contents">
        <span>ON THIS REPORT</span>
        <ol>{sections.map(([key], index) => <li key={key}><a href={`#${sectionId(key)}`}><small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>{labels[key] || key.replaceAll('_', ' ')}</a></li>)}</ol>
      </nav>
      <div className="report-sections">{sections.map(([key, content]) => <section className="report-section" id={sectionId(key)} key={key}>
        <div className="section-head"><h2>{labels[key] || key.replaceAll('_', ' ')}</h2><a href={`/api/runs/${run.id}/download/${key}`}>Download .md</a></div>
        {raw ? <pre>{content}</pre> : <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>}
      </section>)}</div>
    </div> : <p className="empty">Report content is not available.</p>}
  </article>
}
