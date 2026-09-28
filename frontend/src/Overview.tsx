import { useEffect, useRef, useState } from 'react'
import './Overview.css'

export type OverviewRow = {
  id: string
  ticker: string
  analysis_date: string
  rating: string
  score: number | null
  action: string
  horizon: string
  allocation: number
  entry: string
  tp1: string
  tp2: string
  stop_loss: string
  risk_reward: string
  confidence: string
  invalidation: string
  time_stop: string
  risk_dollars: number | null
  stop_distance_pct: number | null
  rationale: string
  caveat: string
}

export type OverviewData = {
  budget: number
  cash: number
  counts: { buy: number; hold: number; sell: number; unknown: number }
  timeline: OverviewTimelinePoint[]
  ticker_timeline: TickerTimeline[]
  rows: OverviewRow[]
}

type OverviewTimelinePoint = { analysis_date: string; buy: number; hold: number; sell: number; unknown: number }
type TickerObservation = { analysis_date: string; rating: string; category: 'buy' | 'hold' | 'sell' | 'unknown'; run_id: string; llm_model?: string | null }
type TickerTimeline = { ticker: string; observations: TickerObservation[] }

const categories = [
  { key: 'buy', label: 'Buy / Overweight' },
  { key: 'hold', label: 'Hold' },
  { key: 'sell', label: 'Underweight / Sell' },
  { key: 'unknown', label: 'Unknown / Other' },
] as const

function RatingTimeline({ timeline, tickers, hasRuns, onOpenRun }: { timeline: OverviewTimelinePoint[]; tickers: TickerTimeline[]; hasRuns: boolean; onOpenRun: (id: string) => void }) {
  const [chosenDate, setChosenDate] = useState('')
  const [hoveredDate, setHoveredDate] = useState('')
  const chartRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const selectedDate = timeline.some(point => point.analysis_date === chosenDate) ? chosenDate : timeline.at(-1)?.analysis_date
  const selected = timeline.find(point => point.analysis_date === selectedDate)
  const hovered = timeline.find(point => point.analysis_date === hoveredDate)
  const observationsFor = (day: string, key: TickerObservation['category']) => tickers.flatMap(({ ticker, observations }) => observations.filter(observation => observation.analysis_date === day && observation.category === key).map(observation => ({ ...observation, ticker })))
  const minimumWidth = Math.max(240, 110 + (timeline.length - 1) * 82)
  const width = Math.max(minimumWidth, containerWidth)
  useEffect(() => {
    const element = chartRef.current
    if (!element) return
    const measure = () => setContainerWidth(element.clientWidth)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [timeline.length])
  const left = 50
  const right = width - 32
  const top = 25
  const bottom = 220
  const maximum = Math.max(1, ...timeline.flatMap(point => categories.map(({ key }) => point[key])))
  const x = (index: number) => timeline.length === 1 ? (left + right) / 2 : left + (right - left) * index / (timeline.length - 1)
  const y = (count: number) => bottom - count / maximum * (bottom - top)
  useEffect(() => {
    const element = chartRef.current
    if (element && selectedDate && element.scrollWidth > element.clientWidth) {
      const index = timeline.findIndex(point => point.analysis_date === selectedDate)
      element.scrollLeft = x(index) - element.clientWidth / 2
    }
  }, [selectedDate, width])
  const selectedIndex = timeline.findIndex(point => point.analysis_date === selectedDate)
  return <section className="overview-section overview-timeline" aria-labelledby="overview-timeline-title">
    <div className="overview-section-head"><div><span className="overview-kicker">SAVED SIGNALS / BY ANALYSIS DATE</span><h3 id="overview-timeline-title">Decision count timeline</h3></div></div>
    {!timeline.length ? <p className="overview-timeline-empty">{hasRuns ? 'Timeline unavailable from this server. Refresh after updating the server.' : 'No saved analysis dates yet.'}</p> : <div className="overview-timeline-content">
      <div className="overview-timeline-legend" aria-label="Decision series legend">{categories.map(({ key, label }) => <span key={key} className={`overview-legend-item overview-${key}`}><i aria-hidden="true" />{label}</span>)}</div>
      <div className="overview-chart-frame" onMouseLeave={() => setHoveredDate('')}>
        <div className="overview-timeline-scroll" ref={chartRef} role="region" aria-label="Decision count chart (scroll horizontally for more dates)" tabIndex={0}>
        <svg className="overview-timeline-svg" width={width} height="270" viewBox={`0 0 ${width} 270`} role="img" aria-label="Decision counts by analysis date; four lines for Buy, Hold, Sell and Unknown. Choose a date below for exact counts and stocks.">
          {[0, maximum].map(value => <g key={value}><line className="overview-timeline-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="overview-timeline-axis-label" x={left - 12} y={y(value) + 4} textAnchor="end">{value}</text></g>)}
          {selectedIndex >= 0 && <line className="overview-timeline-selected" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} />}
          {timeline.length > 1 && <path className="overview-buy-fill" d={`M ${x(0)} ${bottom} L ${timeline.map((point, index) => `${x(index)} ${y(point.buy)}`).join(' L ')} L ${x(timeline.length - 1)} ${bottom} Z`} />}
          {categories.map(({ key, label }) => <g key={key} className={`overview-${key}`}>
            {timeline.length > 1 && <path className="overview-series" d={`M ${timeline.map((point, index) => `${x(index)} ${y(point[key])}`).join(' L ')}`} />}
            {timeline.map((point, index) => <circle key={point.analysis_date} className="overview-series-dot" cx={x(index)} cy={y(point[key])} r="4"><title>{`${point.analysis_date}: ${label} ${point[key]} — ${observationsFor(point.analysis_date, key).map(item => item.ticker).join(', ') || 'none'}`}</title></circle>)}
          </g>)}
          {timeline.map((point, index) => <text className="overview-timeline-date" key={point.analysis_date} x={x(index)} y="252" textAnchor="middle">{point.analysis_date}</text>)}
          {timeline.map((point, index) => <rect key={point.analysis_date} className="overview-date-hit" x={index === 0 ? 0 : (x(index - 1) + x(index)) / 2} y="0" width={(index === timeline.length - 1 ? width : (x(index) + x(index + 1)) / 2) - (index === 0 ? 0 : (x(index - 1) + x(index)) / 2)} height="270" fill="transparent" onMouseEnter={() => setHoveredDate(point.analysis_date)} onClick={() => setChosenDate(point.analysis_date)} />)}
        </svg>
        </div>
        {hovered && <div className="overview-chart-tooltip" role="status" aria-label="Chart date details"><strong>{hovered.analysis_date}</strong>{categories.map(({ key, label }) => <div key={key}><b>{label}: {hovered[key]}</b><span>{observationsFor(hovered.analysis_date, key).map(item => item.ticker).join(', ') || '—'}</span></div>)}</div>}
      </div>
      <div className="overview-date-strip" role="group" aria-label="Select an analysis date">{timeline.map(point => <button key={point.analysis_date} aria-label={`Select ${point.analysis_date}`} aria-pressed={selectedDate === point.analysis_date} onClick={() => setChosenDate(point.analysis_date)}>{point.analysis_date}</button>)}</div>
      {selected && <div className="overview-date-detail"><h4>Selected date: {selected.analysis_date}</h4>{!tickers.length && <p className="overview-timeline-note">Stock names unavailable from this server; update the backend to see contributing reports.</p>}<div className="overview-date-groups">{categories.map(({ key, label }) => <div key={key} className={`overview-date-group overview-${key}`}><strong>{label}: {selected[key]}</strong><div>{observationsFor(selected.analysis_date, key).map(observation => <button key={observation.run_id} onClick={() => onOpenRun(observation.run_id)} aria-label={`Open ${observation.ticker} report: ${observation.rating}; model ${observation.llm_model || 'not available'}`} title={`${observation.rating} · ${observation.llm_model || 'Model not available'}`}>{observation.ticker}</button>)}</div></div>)}</div></div>}
    </div>}
  </section>
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const available = (value: string | number | null) => value === null || value === '' ? 'Not available' : String(value)
const briefLevel = (value: string | null) => available(value).split(' · ')[0]
const portion = (amount: number, budget: number) => budget > 0 ? amount / budget * 100 : 0

export default function Overview({ data, onOpenRun }: { data: OverviewData; onOpenRun: (id: string) => void }) {
  const { budget, cash, counts, rows, timeline } = data
  const funded = rows.filter(row => row.allocation > 0)
  const watchlist = rows.filter(row => row.allocation === 0)
  const planned = funded.reduce((sum, row) => sum + row.allocation, 0)
  const total = planned + cash
  const reconciled = Math.abs(total - budget) <= 0.005
  const chartEntries = [...funded.map((row, index) => ({ label: row.ticker, amount: row.allocation, color: `var(--allocation-${index % 3 + 1})` })), { label: 'Cash', amount: cash, color: 'var(--allocation-cash)' }]
  let chartOffset = 0
  const chartStops = chartEntries.map(entry => {
    const start = chartOffset
    chartOffset += portion(entry.amount, budget)
    return `${entry.color} ${start}% ${chartOffset}%`
  }).join(', ')
  const chartDescription = `Monthly allocation: ${chartEntries.map(entry => `${entry.label} ${money(entry.amount)}`).join(', ')}`
  const ratings = [
    { label: 'Buy / Overweight', value: counts.buy, color: 'buy' },
    { label: 'Hold', value: counts.hold, color: 'hold' },
    { label: 'Underweight / Sell', value: counts.sell, color: 'sell' },
    { label: 'Unknown', value: counts.unknown, color: 'unknown' },
  ]
  const ratingTotal = ratings.reduce((sum, rating) => sum + rating.value, 0)
  const tallest = Math.max(1, ...ratings.map(rating => rating.value))

  return <section className="overview" aria-labelledby="overview-title">
    <header className="overview-header">
      <div><span className="overview-kicker">RESEARCH DESK / MONTHLY CAPITAL</span><h2 id="overview-title">Monthly allocation plan</h2></div>
      <p>Proposed targets from saved decisions, not current holdings or live advice. Verify current quotes, existing exposure, report conditions, and fractional-share availability before any order.</p>
    </header>

    <RatingTimeline timeline={timeline ?? []} tickers={data.ticker_timeline ?? []} hasRuns={rows.length > 0} onOpenRun={onOpenRun} />

    <div className="overview-dashboard">
      <section className="overview-panel overview-budget" aria-labelledby="overview-budget-title">
        <div className="overview-panel-top"><span className="overview-kicker">01 / CAPITAL MAP</span><span className="overview-status">PROPOSED · NOT ORDERS</span></div>
        <div className="overview-budget-heading"><div><h3 id="overview-budget-title">This month's target</h3><strong>{money(budget)}</strong></div><p><b>{money(planned)}</b> assigned to positive saved ratings<br /><b>{money(cash)}</b> held as cash reserve</p></div>
        <div className="overview-chart-layout">
          <div className="overview-donut" role="img" aria-label={reconciled ? chartDescription : 'Allocation chart unavailable: amounts do not match the budget'} style={{ background: reconciled ? `conic-gradient(${chartStops})` : 'var(--paper-alt)' }}><span className="overview-donut-center"><strong>{reconciled ? money(planned) : '—'}</strong><small>{reconciled ? 'planned targets' : 'check ledger'}</small></span></div>
          <ul className="overview-legend" aria-label="Monthly allocation legend">{chartEntries.map((entry, index) => <li key={entry.label}>
            <span className={`overview-key overview-key-${index < funded.length ? index % 3 + 1 : 'cash'}`} aria-hidden="true" />
            <span className="overview-legend-label">{entry.label}</span><strong>{money(entry.amount)}</strong><small>{portion(entry.amount, budget).toFixed(1)}%</small>
          </li>)}</ul>
        </div>
        {reconciled ? <div className="overview-budget-rail" aria-hidden="true">{chartEntries.filter(entry => entry.amount > 0).map(entry => <span key={entry.label} style={{ width: `${portion(entry.amount, budget)}%`, background: entry.color }} />)}</div> : <p className="overview-warning" role="status">Allocations and cash do not match the stated budget; chart withheld. Review the source data.</p>}
        <p className="overview-rule">Planning rule: $75 positive-rating sleeve · Buy : Overweight = 3 : 2 · $50 maximum per name · remainder held in cash. Targets are staged, not purchase instructions.</p>
      </section>

      <section className="overview-panel overview-signal" aria-labelledby="overview-rating-title">
        <div className="overview-panel-top"><span className="overview-kicker">02 / SAVED SIGNALS</span><span className="overview-status">LATEST PER TICKER</span></div>
        <h3 id="overview-rating-title">Rating distribution</h3>
        <strong className="overview-signal-total">{ratingTotal}<small> saved decisions</small></strong>
        <div className="overview-rating-chart" role="img" aria-label={`Rating distribution: Buy or Overweight ${counts.buy}, Hold ${counts.hold}, Underweight or Sell ${counts.sell}, Unknown ${counts.unknown}`}>
          {ratings.map(rating => <div className="overview-rating-column" key={rating.label} aria-hidden="true"><strong>{rating.value}</strong><span className="overview-rating-track"><span className={`overview-rating-bar overview-${rating.color}`} style={{ height: `${rating.value / tallest * 100}%` }} /></span><small>{rating.label}</small></div>)}
        </div>
        <p>Ratings describe old report decisions. They do not represent current holdings or live market signals.</p>
      </section>
    </div>

    {funded.length > 0 && <section className="overview-section" aria-labelledby="overview-plans-title">
      <div className="overview-section-head"><div><span className="overview-kicker">03 / DECISION GATES</span><h3 id="overview-plans-title">Conditional plans</h3></div><span>Numbers from saved reports · dollar targets are this plan</span></div>
      <div className="overview-plans">{funded.map((row, index) => <article className="overview-plan" aria-label={`${available(row.ticker)} conditional plan`} key={row.id}>
        <div className="overview-plan-head"><div><span className="overview-kicker">{String(index + 1).padStart(2, '0')} / {available(row.rating)}</span><h4>{available(row.ticker)}</h4><span className="overview-action">{available(row.action)}</span></div><div className="overview-plan-amount"><small>MONTHLY TARGET</small><strong>{money(row.allocation)}</strong></div></div>
        <div className="overview-levels">
          <div><span>REPORT ENTRY</span><strong>{briefLevel(row.entry)}</strong></div><div><span>PROTECTIVE LEVEL</span><strong>{briefLevel(row.stop_loss)}</strong></div>
          <div><span>TARGET 1</span><strong>{available(row.tp1)}</strong></div><div><span>TARGET 2</span><strong>{available(row.tp2)}</strong></div>
        </div>
        <div className="overview-plan-foot"><span>{row.stop_distance_pct === null ? 'Risk distance not available' : `Report stop distance ${row.stop_distance_pct}%`}</span><span>Saved {available(row.analysis_date)}</span></div>
        <details className="overview-plan-details"><summary>Conditions & source detail</summary><dl><div><dt>Horizon</dt><dd>{available(row.horizon)}</dd></div><div><dt>Full entry</dt><dd>{available(row.entry)}</dd></div><div><dt>Full protective level</dt><dd>{available(row.stop_loss)}</dd></div><div><dt>Invalidation</dt><dd>{available(row.invalidation)}</dd></div><div><dt>Time stop</dt><dd>{available(row.time_stop)}</dd></div><div><dt>Risk / reward</dt><dd>{available(row.risk_reward)}</dd></div><div><dt>Risk dollars</dt><dd>{row.risk_dollars === null ? 'Not available' : money(row.risk_dollars)}</dd></div><div><dt>Rationale</dt><dd>{available(row.rationale)}</dd></div><div><dt>Caveat</dt><dd>{available(row.caveat)}</dd></div></dl></details>
        <button className="overview-source" onClick={() => onOpenRun(row.id)}>Inspect {available(row.ticker)} source analysis ↗</button>
      </article>)}</div>
      {funded.length > 1 && <p className="overview-concentration">Check concentration against existing holdings: a monthly contribution across a few names is not a diversified portfolio.{funded.some(row => row.ticker === 'MU') && funded.some(row => row.ticker === 'AMD') ? ' MU and AMD also share semiconductor exposure.' : ''}</p>}
    </section>}

    {watchlist.length > 0 && <section className="overview-section overview-watch" aria-labelledby="overview-watch-title"><div className="overview-section-head"><div><span className="overview-kicker">04 / NO NEW CAPITAL</span><h3 id="overview-watch-title">Watch, hold or avoid</h3></div><span>Zero new-money target is not a claim about holdings</span></div><ul>{watchlist.map(row => <li key={row.id}><button onClick={() => onOpenRun(row.id)}>{row.ticker} ↗</button><span>{available(row.rating)}</span><strong>$0</strong></li>)}</ul></section>}

    <section className="overview-section" aria-labelledby="overview-priority-title">
      <div className="overview-section-head"><div><span className="overview-kicker">05 / EVIDENCE LEDGER</span><h3 id="overview-priority-title">Ranked priorities</h3></div><span>Saved rating, then ticker · no estimated score</span></div>
      <div className="overview-scroll" role="region" aria-label="Ranked priorities table" tabIndex={0}><table aria-label="Ranked priorities"><thead><tr><th scope="col">Rank</th><th scope="col">Ticker / report</th><th scope="col">Date</th><th scope="col">Rating</th><th scope="col">Score</th><th scope="col">Monthly target</th><th scope="col">Action</th><th scope="col">Entry</th><th scope="col">Stop</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><th scope="row"><button className="overview-open" onClick={() => onOpenRun(row.id)} aria-label={`Open ${available(row.ticker)} report`}>{available(row.ticker)} ↗</button></th><td>{available(row.analysis_date)}</td><td>{available(row.rating)}</td><td>{available(row.score)}</td><td className="overview-target-cell">{money(row.allocation)}</td><td>{available(row.action)}</td><td>{briefLevel(row.entry)}</td><td>{briefLevel(row.stop_loss)}</td></tr>) : <tr><td colSpan={9}>No completed analyses available.</td></tr>}</tbody></table></div>
    </section>

    <section className="overview-section overview-ledger" aria-labelledby="overview-allocation-title"><div className="overview-section-head"><div><span className="overview-kicker">06 / RECONCILIATION</span><h3 id="overview-allocation-title">Allocation ledger</h3></div><span>Proposed monthly targets, not actual balances</span></div><div className="overview-scroll" role="region" aria-label="Allocation table" tabIndex={0}><table aria-label="Allocation"><thead><tr><th scope="col">Position</th><th scope="col">Target amount</th><th scope="col">Share of budget</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row">{available(row.ticker)}</th><td>{money(row.allocation)}</td><td>{portion(row.allocation, budget).toFixed(1)}%</td></tr>)}<tr><th scope="row">Cash</th><td>{money(cash)}</td><td>{portion(cash, budget).toFixed(1)}%</td></tr></tbody><tfoot><tr><th scope="row">Total</th><td>{money(total)}</td><td>Budget {money(budget)}</td></tr></tfoot></table></div></section>
  </section>
}
