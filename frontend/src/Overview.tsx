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
const portion = (amount: number, budget: number) => budget > 0 ? `${Math.max(0, Math.min(100, amount / budget * 100))}%` : '0%'

export default function Overview({ data, onOpenRun }: { data: OverviewData; onOpenRun: (id: string) => void }) {
  const { budget, cash, counts, rows } = data
  const total = cash + rows.reduce((sum, row) => sum + row.allocation, 0)
  const ratings = [
    { label: 'Buy', value: counts.buy, color: 'buy' },
    { label: 'Hold', value: counts.hold, color: 'hold' },
    { label: 'Sell', value: counts.sell, color: 'sell' },
    { label: 'Unknown', value: counts.unknown, color: 'unknown' },
  ]
  const ratingTotal = ratings.reduce((sum, rating) => sum + rating.value, 0)

  return <section className="overview" aria-labelledby="overview-title">
    <header className="overview-header">
      <div><span className="overview-kicker">RESEARCH DESK / OVERVIEW</span><h2 id="overview-title">Conditional overview</h2></div>
      <p>Research-based scenarios, not live advice. Review the underlying reports before acting.</p>
    </header>

    <div className="overview-summary">
      <section className="overview-panel" aria-labelledby="overview-summary-title">
        <h3 id="overview-summary-title">Executive summary</h3>
        <p>{rows.length ? `${rows.length} ranked ${rows.length === 1 ? 'analysis' : 'analyses'} · ${counts.buy} buy · ${counts.hold} hold · ${counts.sell} sell · ${counts.unknown} unknown.` : 'No completed analyses available.'}</p>
        <p>Planning budget <strong>{money(budget)}</strong> · Unallocated cash <strong>{money(cash)}</strong>.</p>
      </section>
      <section className="overview-panel" aria-labelledby="overview-rating-title">
        <h3 id="overview-rating-title">Rating distribution</h3>
        <ul className="overview-ratings" aria-label="Rating distribution">{ratings.map(rating => <li key={rating.label}>
          <span>{rating.label}</span><span className="overview-meter" aria-hidden="true"><span className={`overview-fill overview-${rating.color}`} style={{ width: ratingTotal ? `${rating.value / ratingTotal * 100}%` : '0%' }} /></span><strong>{rating.value}</strong>
        </li>)}</ul>
      </section>
    </div>

    <section className="overview-section" aria-labelledby="overview-priority-title">
      <div className="overview-section-head"><h3 id="overview-priority-title">Ranked priorities</h3><span>Ordered by saved rating, then ticker · score is not estimated · scroll horizontally</span></div>
      <div className="overview-scroll" role="region" aria-label="Ranked priorities table" tabIndex={0}>
        <table aria-label="Ranked priorities"><thead><tr><th scope="col">Rank</th><th scope="col">Ticker / report</th><th scope="col">Date</th><th scope="col">Rating</th><th scope="col">Score</th><th scope="col">Action</th><th scope="col">Horizon</th><th scope="col">Allocation</th><th scope="col">Entry</th><th scope="col">TP1</th><th scope="col">TP2</th><th scope="col">Stop loss</th><th scope="col">Risk / reward</th><th scope="col">Confidence</th></tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={row.id}>
            <td>{index + 1}</td><th scope="row"><button className="overview-open" onClick={() => onOpenRun(row.id)} aria-label={`Open ${available(row.ticker)} report`}>{available(row.ticker)} <span aria-hidden="true">↗</span></button></th>
            <td>{available(row.analysis_date)}</td><td>{available(row.rating)}</td><td>{available(row.score)}</td><td>{available(row.action)}</td><td>{available(row.horizon)}</td><td>{money(row.allocation)}</td><td>{available(row.entry)}</td><td>{available(row.tp1)}</td><td>{available(row.tp2)}</td><td>{available(row.stop_loss)}</td><td>{available(row.risk_reward)}</td><td>{available(row.confidence)}</td>
          </tr>) : <tr><td colSpan={14}>No completed analyses available.</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <section className="overview-section" aria-labelledby="overview-allocation-title">
      <div className="overview-section-head"><h3 id="overview-allocation-title">Conditional allocation</h3><span>Share of {money(budget)} budget</span></div>
      <div className="overview-scroll" role="region" aria-label="Allocation table" tabIndex={0}>
        <table aria-label="Allocation"><thead><tr><th scope="col">Position</th><th scope="col">Amount</th><th scope="col">Share of budget</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{available(row.ticker)}</th><td>{money(row.allocation)}</td><td><div className="overview-share"><span className="overview-meter" aria-hidden="true"><span className="overview-fill overview-blue" style={{ width: portion(row.allocation, budget) }} /></span><span>{budget > 0 ? `${(row.allocation / budget * 100).toFixed(1)}%` : 'Not available'}</span></div></td></tr>)}
            <tr><th scope="row">Cash</th><td>{money(cash)}</td><td><div className="overview-share"><span className="overview-meter" aria-hidden="true"><span className="overview-fill overview-blue" style={{ width: portion(cash, budget) }} /></span><span>{budget > 0 ? `${(cash / budget * 100).toFixed(1)}%` : 'Not available'}</span></div></td></tr>
          </tbody><tfoot><tr><th scope="row">Total</th><td>{money(total)}</td><td>Budget {money(budget)}</td></tr></tfoot>
        </table>
      </div>
      {Math.abs(total - budget) > 0.005 && <p className="overview-warning" role="status">Allocations and cash do not match the stated budget; review the source data.</p>}
    </section>

    {rows.length > 0 && <section className="overview-section" aria-labelledby="overview-plans-title">
      <div className="overview-section-head"><h3 id="overview-plans-title">Conditional plans</h3><span>Scenario inputs, not execution instructions</span></div>
      <div className="overview-plans">{rows.map((row, index) => <article className="overview-plan" aria-label={`${available(row.ticker)} conditional plan`} key={row.id}>
        <div className="overview-plan-head"><span>{String(index + 1).padStart(2, '0')} / {available(row.ticker)}</span><strong>{available(row.action)}</strong></div>
        <dl>
          <div><dt>Entry</dt><dd>{available(row.entry)}</dd></div><div><dt>Target 1</dt><dd>{available(row.tp1)}</dd></div><div><dt>Target 2</dt><dd>{available(row.tp2)}</dd></div><div><dt>Stop loss</dt><dd>{available(row.stop_loss)}</dd></div>
          <div><dt>Risk / reward</dt><dd>{available(row.risk_reward)}</dd></div><div><dt>Risk dollars</dt><dd>{row.risk_dollars === null ? 'Not available' : money(row.risk_dollars)}</dd></div><div><dt>Stop distance</dt><dd>{row.stop_distance_pct === null ? 'Not available' : `${row.stop_distance_pct}%`}</dd></div><div><dt>Horizon</dt><dd>{available(row.horizon)}</dd></div>
          <div><dt>Invalidation</dt><dd>{available(row.invalidation)}</dd></div><div><dt>Time stop</dt><dd>{available(row.time_stop)}</dd></div><div><dt>Rationale</dt><dd>{available(row.rationale)}</dd></div><div><dt>Caveat</dt><dd>{available(row.caveat)}</dd></div>
        </dl>
      </article>)}</div>
    </section>}
  </section>
}
