import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import Overview, { type OverviewData } from './Overview'

afterEach(cleanup)

const data: OverviewData = {
  budget: 105,
  cash: 65,
  counts: { buy: 1, hold: 1, sell: 0, unknown: 0 },
  timeline: [
    { analysis_date: '2026-09-23', buy: 0, hold: 1, sell: 0, unknown: 0 },
    { analysis_date: '2026-09-24', buy: 1, hold: 0, sell: 0, unknown: 0 },
  ],
  rows: [
    { id: 'run-amd', ticker: 'AMD', analysis_date: '2026-09-24', rating: 'Buy', score: 82, action: 'Conditional buy', horizon: 'Weeks', allocation: 40, entry: '$120–$125', tp1: '$135', tp2: '$145', stop_loss: '$115', risk_reward: '2:1', confidence: 'Moderate', invalidation: 'Break below support', time_stop: '30 days', risk_dollars: 3, stop_distance_pct: 7.5, rationale: 'Strong earnings', caveat: 'Volatile market' },
    { id: 'run-mu', ticker: 'MU', analysis_date: '2026-09-23', rating: 'Hold', score: null, action: '', horizon: '', allocation: 0, entry: '', tp1: '', tp2: '', stop_loss: '', risk_reward: '', confidence: '', invalidation: '', time_stop: '', risk_dollars: null, stop_distance_pct: null, rationale: '', caveat: '' },
  ],
}

test('renders large quantitative allocation and rating graphics with funded plans', async () => {
  const onOpenRun = vi.fn()
  render(<Overview data={data} onOpenRun={onOpenRun} />)
  expect(screen.getByRole('heading', { name: /monthly allocation plan/i })).toBeInTheDocument()
  expect(screen.getByText(/not current holdings or live advice/i)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /monthly allocation.*AMD.*\$40.*cash.*\$65/i })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /rating distribution.*buy or overweight 1.*hold 1/i })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /underweight or sell 0.*unknown 0/i })).toBeInTheDocument()
  const priority = screen.getByRole('table', { name: /ranked priorities/i })
  expect(within(priority).getAllByRole('row')[1]).toHaveTextContent('AMD')
  expect(within(priority).getAllByRole('row')[2]).toHaveTextContent('MU')
  expect(within(priority).getByText('82')).toBeInTheDocument()
  const allocation = screen.getByRole('table', { name: /allocation/i })
  expect(within(allocation).getByText('$65.00')).toBeInTheDocument()
  expect(within(allocation).getByText('$105.00')).toBeInTheDocument()
  expect(screen.getByText('Break below support')).toBeInTheDocument()
  expect(screen.getByText('30 days')).toBeInTheDocument()
  expect(screen.getByRole('article', { name: /AMD conditional plan/i })).toHaveTextContent('$40.00')
  expect(screen.queryByRole('article', { name: /MU conditional plan/i })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /open AMD report/i }))
  expect(onOpenRun).toHaveBeenCalledWith('run-amd')
})

test('shows unavailable values explicitly without inventing a trade', () => {
  render(<Overview data={{ ...data, rows: [data.rows[1]] }} onOpenRun={vi.fn()} />)
  expect(screen.getByRole('img', { name: /allocation chart unavailable.*do not match the budget/i })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('chart withheld')
  expect(screen.queryByRole('img', { name: /monthly allocation:.*cash/i })).not.toBeInTheDocument()
  const priority = screen.getByRole('table', { name: /ranked priorities/i })
  expect(within(priority).getAllByText('Not available').length).toBeGreaterThan(0)
  expect(screen.queryByRole('article', { name: /MU conditional plan/i })).not.toBeInTheDocument()
  expect(screen.getByRole('table', { name: /ranked priorities/i })).toHaveTextContent('Not available')
})

test('keeps long sourced levels in disclosure and surfaces their leading numbers', async () => {
  const entry = '$1,040.00 · limit order after pullback confirmation'
  const stop = '$950.00 · hard invalidation after structure break'
  render(<Overview data={{ ...data, rows: [{ ...data.rows[0], entry, stop_loss: stop }] }} onOpenRun={vi.fn()} />)
  const plan = screen.getByRole('article', { name: /AMD conditional plan/i })
  expect(within(plan).getByText('$1,040.00')).toBeInTheDocument()
  expect(within(plan).getByText('$950.00')).toBeInTheDocument()
  expect(within(screen.getByRole('table', { name: /ranked priorities/i })).getByText('$1,040.00')).toBeInTheDocument()
  await userEvent.click(within(plan).getByText('Conditions & source detail'))
  expect(within(plan).getByText(entry)).toBeInTheDocument()
  expect(within(plan).getByText(stop)).toBeInTheDocument()
})

test('renders an empty overview and zero-width distribution safely', () => {
  render(<Overview data={{ budget: 105, cash: 105, counts: { buy: 0, hold: 0, sell: 0, unknown: 0 }, timeline: [], rows: [] }} onOpenRun={vi.fn()} />)
  expect(screen.getAllByText(/no completed analyses/i)).toHaveLength(1)
  expect(screen.getByRole('table', { name: /allocation/i })).toHaveTextContent('$105.00')
  expect(screen.getByRole('img', { name: /rating distribution.*buy or overweight 0.*hold 0.*underweight or sell 0.*unknown 0/i })).toBeInTheDocument()
  expect(screen.getByText('No saved analysis dates yet.')).toBeInTheDocument()
})

test('handles a stale backend response without timeline as an empty timeline', () => {
  render(<Overview data={{ ...data, timeline: undefined } as unknown as OverviewData} onOpenRun={vi.fn()} />)
  expect(screen.getByText('No saved analysis dates yet.')).toBeInTheDocument()
})

test('plots only observed dates as stacked filled areas and retains exact daily counts', () => {
  render(<Overview data={{ ...data, timeline: [
    { analysis_date: '2026-09-23', buy: 2, hold: 1, sell: 0, unknown: 1 },
    { analysis_date: '2026-09-27', buy: 1, hold: 2, sell: 3, unknown: 0 },
  ] }} onOpenRun={vi.fn()} />)
  const chart = screen.getByRole('img', { name: /saved rating timeline.*2 observed dates/i })
  const timelineSection = screen.getByRole('heading', { name: 'Rating timeline' }).closest('section')!
  expect(timelineSection.compareDocumentPosition(screen.getByRole('heading', { name: "This month's target" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(chart.querySelectorAll('path.overview-timeline-area')).toHaveLength(4)
  expect(chart).toHaveTextContent('2026-09-23')
  expect(chart).toHaveTextContent('2026-09-27')
  expect(chart).not.toHaveTextContent('2026-09-24')
  expect(screen.getByText(/between dates are visual connections, not measurements/i)).toBeInTheDocument()
  const table = screen.getByRole('table', { name: /saved rating counts by analysis date/i })
  expect(Array.from(within(table).getAllByRole('row')[1].querySelectorAll('th, td'), cell => cell.textContent)).toEqual(['2026-09-23', '2', '1', '0', '1', '4'])
  expect(Array.from(within(table).getAllByRole('row')[2].querySelectorAll('th, td'), cell => cell.textContent)).toEqual(['2026-09-27', '1', '2', '3', '0', '6'])
})

test('shows a single observed date as bands without invented points', () => {
  render(<Overview data={{ ...data, timeline: [{ analysis_date: '2026-09-24', buy: 1, hold: 2, sell: 0, unknown: 1 }] }} onOpenRun={vi.fn()} />)
  const chart = screen.getByRole('img', { name: /saved rating timeline.*1 observed date/i })
  expect(chart.querySelectorAll('rect.overview-timeline-band')).toHaveLength(4)
  expect(chart.querySelectorAll('path.overview-timeline-area')).toHaveLength(0)
  expect(chart).toHaveTextContent('2026-09-24')
  expect(screen.getByText(/one observed date shown as stacked bands; no trend implied/i)).toBeInTheDocument()
  const row = within(screen.getByRole('table', { name: /saved rating counts by analysis date/i })).getAllByRole('row')[1]
  expect(Array.from(row.querySelectorAll('th, td'), cell => cell.textContent)).toEqual(['2026-09-24', '1', '2', '0', '1', '4'])
})
