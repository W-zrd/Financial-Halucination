import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => cleanup())

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  }))
})

test('shows exact depth meanings and validates free-text ticker', async () => {
  render(<App />)
  expect(await screen.findByText('TradingAgents')).toBeInTheDocument()
  expect(screen.getByText('Quick research, few debate and strategy discussion rounds')).toBeInTheDocument()
  expect(screen.getByText('Middle ground, moderate debate rounds and strategy discussion')).toBeInTheDocument()
  expect(screen.getByText('Comprehensive research, in depth debate and strategy discussion')).toBeInTheDocument()
  const ticker = screen.getByLabelText('Ticker')
  await userEvent.clear(ticker)
  await userEvent.type(ticker, '../bad')
  await userEvent.click(screen.getByRole('button', { name: /run analysis/i }))
  expect(await screen.findByText(/valid ticker/i)).toBeInTheDocument()
})

test('renders real rating vocabulary and markdown without raw html', async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([{ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Overweight', created_at: '2026-09-24' }])
    if (url.endsWith('/api/runs/one')) return ok({ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', rating: 'Overweight', sections: { market_report: '# Market\n<script>alert(1)</script>' } })
    return ok({})
  })
  render(<App />)
  expect(await screen.findByText('Overweight')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /AMD.*2026-09-24/i }))
  expect(await screen.findByRole('heading', { name: 'Market' })).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
})

test('opens the completed report when a live run finishes', async () => {
  let historyCalls = 0
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && init?.method === 'POST') return ok({ id: 'job-one', status: 'queued', elapsed_seconds: 0 }, 202)
    if (url.endsWith('/api/runs')) {
      historyCalls += 1
      return ok(historyCalls > 1 ? [{ id: 'job-one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24' }] : [])
    }
    if (url.endsWith('/api/runs/job-one')) return ok({ id: 'job-one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', sections: { final_trade_decision: 'Rating: Buy' } })
    return ok({})
  })

  class FakeEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: 'job-one', status: 'done', elapsed_seconds: 2, message: 'Analysis complete' }) } as MessageEvent), 0)
    }
    close() {}
  }
  vi.stubGlobal('EventSource', FakeEventSource)

  render(<App />)
  await screen.findByRole('button', { name: /run analysis/i })
  await userEvent.click(screen.getByRole('button', { name: /run analysis/i }))
  expect(await screen.findByText('FINAL RATING')).toBeInTheDocument()
  expect(screen.getAllByText('Buy').length).toBeGreaterThanOrEqual(1)
})
