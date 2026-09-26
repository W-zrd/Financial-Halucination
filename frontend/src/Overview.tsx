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
  rows: OverviewRow[]
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const available = (value: string | number | null) => value === null || value === '' ? 'Not available' : String(value)
const briefLevel = (value: string | null) => available(value).split(' · ')[0]
const portion = (amount: number, budget: number) => budget > 0 ? amount / budget * 100 : 0

export default function Overview({ data, onOpenRun }: { data: OverviewData; onOpenRun: (id: string) => void }) {
  const { budget, cash, counts, rows } = data
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
