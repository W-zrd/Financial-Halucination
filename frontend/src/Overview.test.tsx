import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import Overview, { type OverviewData } from './Overview'

afterEach(cleanup)

const data: OverviewData = {
  budget: 105,
  cash: 65,
  counts: { buy: 1, hold: 1, sell: 0, unknown: 0 },
  rows: [
    { id: 'run-amd', ticker: 'AMD', analysis_date: '2026-09-24', rating: 'Buy', score: 82, action: 'Conditional buy', horizon: 'Weeks', allocation: 40, entry: '$120–$125', tp1: '$135', tp2: '$145', stop_loss: '$115', risk_reward: '2:1', confidence: 'Moderate', invalidation: 'Break below support', time_stop: '30 days', risk_dollars: 3, stop_distance_pct: 7.5, rationale: 'Strong earnings', caveat: 'Volatile market' },
    { id: 'run-mu', ticker: 'MU', analysis_date: '2026-09-23', rating: 'Hold', score: null, action: '', horizon: '', allocation: 0, entry: '', tp1: '', tp2: '', stop_loss: '', risk_reward: '', confidence: '', invalidation: '', time_stop: '', risk_dollars: null, stop_distance_pct: null, rationale: '', caveat: '' },
  ],
}

test('renders ranked conditional plans and a budget-reconciling allocation table', async () => {
  const onOpenRun = vi.fn()
  render(<Overview data={data} onOpenRun={onOpenRun} />)
  expect(screen.getByRole('heading', { name: /conditional overview/i })).toBeInTheDocument()
  expect(screen.getByText(/not live advice/i)).toBeInTheDocument()
  const ratings = screen.getByRole('list', { name: /rating distribution/i })
  expect(within(ratings).getByText('Buy')).toBeInTheDocument()
  expect(within(ratings).getAllByText('1')).toHaveLength(2)
  const priority = screen.getByRole('table', { name: /ranked priorities/i })
  expect(within(priority).getAllByRole('row')[1]).toHaveTextContent('AMD')
  expect(within(priority).getAllByRole('row')[2]).toHaveTextContent('MU')
  expect(within(priority).getByText('82')).toBeInTheDocument()
  const allocation = screen.getByRole('table', { name: /allocation/i })
  expect(within(allocation).getByText('$65.00')).toBeInTheDocument()
  expect(within(allocation).getByText('$105.00')).toBeInTheDocument()
  expect(screen.getByText('Break below support')).toBeInTheDocument()
  expect(screen.getByText('30 days')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /open AMD report/i }))
  expect(onOpenRun).toHaveBeenCalledWith('run-amd')
})

test('shows unavailable values explicitly without inventing a plan', () => {
  render(<Overview data={{ ...data, rows: [data.rows[1]] }} onOpenRun={vi.fn()} />)
  const priority = screen.getByRole('table', { name: /ranked priorities/i })
  expect(within(priority).getAllByText('Not available').length).toBeGreaterThan(0)
  const plan = screen.getByRole('article', { name: /MU conditional plan/i })
  expect(within(plan).getAllByText('Not available').length).toBeGreaterThan(5)
  expect(within(plan).queryByText('Strong earnings')).not.toBeInTheDocument()
})

test('renders an empty overview and zero-width distribution safely', () => {
  render(<Overview data={{ budget: 105, cash: 105, counts: { buy: 0, hold: 0, sell: 0, unknown: 0 }, rows: [] }} onOpenRun={vi.fn()} />)
  expect(screen.getAllByText(/no completed analyses/i)).toHaveLength(2)
  expect(screen.getByRole('table', { name: /allocation/i })).toHaveTextContent('$105.00')
  expect(screen.getByRole('list', { name: /rating distribution/i })).toHaveTextContent('0')
})
