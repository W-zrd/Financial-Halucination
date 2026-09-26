import { act, cleanup, render, screen } from '@testing-library/react'
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
  expect(screen.getByText('PRIVATE RESEARCH / MULTI-AGENT FINANCE')).toBeInTheDocument()
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
    if (url.endsWith('/api/runs')) return ok([{ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 'Not available', status: 'done', rating: 'Overweight', created_at: '2026-09-24' }])
    if (url.endsWith('/api/runs/one')) return ok({ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', rating: 'Overweight', sections: { market_report: '# Market\n<script>alert(1)</script>' } })
    return ok({})
  })
  render(<App />)
  expect(await screen.findByText('Overweight')).toBeInTheDocument()
  expect(screen.getByText(/Depth not available/)).toBeInTheDocument()
  expect(screen.queryByText(/DNot available/)).not.toBeInTheDocument()
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

test('report table of contents links to stable section anchors', async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([{ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24' }])
    if (url.endsWith('/api/runs/one')) return ok({ id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', sections: { market_report: 'Market body', final_trade_decision: 'Decision body' } })
    return ok({})
  })

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /AMD.*2026-09-24/i }))

  const toc = await screen.findByRole('navigation', { name: /report contents/i })
  expect(toc).toContainElement(screen.getByRole('link', { name: 'Market Analyst' }))
  expect(screen.getByRole('link', { name: 'Market Analyst' })).toHaveAttribute('href', '#section-market-report')
  expect(screen.getByRole('heading', { name: 'Market Analyst' }).closest('section')).toHaveAttribute('id', 'section-market-report')
  expect(screen.getAllByRole('link', { name: /download .md/i })[0]).toHaveAttribute('href', '/api/runs/one/download/market_report')
  await userEvent.click(screen.getByRole('button', { name: 'Raw view' }))
  expect(screen.getByText('Market body').tagName).toBe('PRE')
  await userEvent.click(screen.getByRole('button', { name: 'Rendered view' }))
  expect(screen.getByText('Market body').tagName).toBe('P')
})

test('focuses one run at a time and reveals setup only when requested', async () => {
  let sequence = 0
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && init?.method === 'POST') {
      sequence += 1
      const payload = JSON.parse(String(init.body))
      return ok({ id: `job-${sequence}`, ticker: payload.ticker, analysis_date: payload.analysis_date, depth: payload.depth, status: 'queued', elapsed_seconds: 0 }, 202)
    }
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })
  class IdleEventSource { onmessage: ((event: MessageEvent) => void) | null = null; onerror: (() => void) | null = null; close() {} }
  vi.stubGlobal('EventSource', IdleEventSource)

  render(<App />)
  const start = await screen.findByRole('button', { name: /run analysis/i })
  await userEvent.click(start)
  expect(screen.queryByRole('button', { name: /run analysis/i })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /new analysis/i }))
  const ticker = screen.getByLabelText('Ticker')
  await userEvent.clear(ticker)
  await userEvent.type(ticker, 'NVDA')
  await userEvent.click(start)

  expect(await screen.findByRole('heading', { name: /NVDA analysis/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /AMD analysis/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /inspect AMD/i })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /inspect AMD/i }))
  expect(screen.getByRole('heading', { name: /AMD analysis/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /NVDA analysis/i })).not.toBeInTheDocument()
})

test('force stop calls the cancel API with CSRF and marks the run cancelled', async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && init?.method === 'POST') return ok({ id: 'job-stop', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 4 }, 202)
    if (url.endsWith('/api/runs')) return ok([])
    if (url.endsWith('/api/jobs/job-stop/cancel')) return ok({ id: 'job-stop', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'cancelled', elapsed_seconds: 5 })
    return ok({})
  })
  class IdleEventSource { onmessage: ((event: MessageEvent) => void) | null = null; onerror: (() => void) | null = null; close() {} }
  vi.stubGlobal('EventSource', IdleEventSource)

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /run analysis/i }))
  await userEvent.click(await screen.findByRole('button', { name: /stop AMD analysis/i }))

  expect(fetch).toHaveBeenCalledWith('/api/jobs/job-stop/cancel', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }) }))
  expect(await screen.findByText('CANCELLED')).toBeInTheDocument()
})

test('keeps SSE open for native reconnect and shows production event fields', async () => {
  class LiveEventSource {
    static instance: LiveEventSource
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    onopen: (() => void) | null = null
    readyState = 0
    constructor() { LiveEventSource.instance = this }
    close = vi.fn()
    emit(data: unknown, lastEventId = '') {
      this.onmessage?.({ data: JSON.stringify(data), lastEventId } as MessageEvent)
    }
  }
  vi.stubGlobal('EventSource', LiveEventSource)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && init?.method === 'POST') return ok({ id: 'job-live', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 1 }, 202)
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /run analysis/i }))
  act(() => LiveEventSource.instance.emit({ id: 'job-live', status: 'running', elapsed_seconds: 2, type: 'agent', message: 'Bull Researcher: Building the growth case' }, '0'))
  expect(await screen.findByText('Bull Researcher: Building the growth case', { selector: '.activity-line p' })).toBeInTheDocument()
  expect(screen.getByText('agent')).toBeInTheDocument()
  act(() => LiveEventSource.instance.onerror?.())
  expect(LiveEventSource.instance.close).not.toHaveBeenCalled()
  expect(screen.getByText(/Reconnecting.*last received/i)).toBeInTheDocument()
  act(() => LiveEventSource.instance.onopen?.())
  expect(screen.getByText('Live connection')).toBeInTheDocument()
  expect(screen.queryByText(/Reconnecting.*last received/i)).not.toBeInTheDocument()
  act(() => LiveEventSource.instance.emit({ id: 'job-live', status: 'running', elapsed_seconds: 3, type: 'agent', message: 'Bear Researcher: Testing the downside' }, '1'))
  expect(screen.getAllByText('Bull Researcher: Building the growth case', { selector: '.activity-line p' })).toHaveLength(1)
  expect(screen.getByText('Bear Researcher: Testing the downside', { selector: '.activity-line p' })).toBeInTheDocument()
  act(() => { LiveEventSource.instance.readyState = 2; LiveEventSource.instance.onerror?.() })
  expect(screen.getByText(/Disconnected.*last received/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /reconnect stream/i }))
  expect(screen.getByText(/Connecting.*last received/i)).toBeInTheDocument()
})

test('restores active jobs and reconnects their live streams on load', async () => {
  const opened: string[] = []
  class TrackingEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    constructor(url: string) { opened.push(url) }
    close() {}
  }
  vi.stubGlobal('EventSource', TrackingEventSource)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/jobs')) return ok([
      { id: 'restored-queued', ticker: 'AVGO', analysis_date: '2026-09-24', depth: 3, status: 'queued', elapsed_seconds: 3 },
      { id: 'restored-running', ticker: 'MU', analysis_date: '2026-09-24', depth: 5, status: 'running', elapsed_seconds: 20 },
      { id: 'old-done', ticker: 'SPY', analysis_date: '2026-09-23', depth: 1, status: 'done', elapsed_seconds: 30 },
    ])
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })

  render(<App />)

  expect(await screen.findByRole('heading', { name: /AVGO analysis/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /inspect MU/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /SPY analysis/i })).not.toBeInTheDocument()
  expect(opened).toEqual(expect.arrayContaining(['/api/runs/restored-queued/events', '/api/runs/restored-running/events']))
})

test('restores active jobs immediately after signing in', async () => {
  const opened: string[] = []
  class TrackingEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    constructor(url: string) { opened.push(url) }
    close() {}
  }
  vi.stubGlobal('EventSource', TrackingEventSource)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ detail: 'Authentication required' }, 401)
    if (url.endsWith('/api/auth/login') && init?.method === 'POST') return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/jobs')) return ok([
      { id: 'after-login', ticker: 'PANW', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 12 },
    ])
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })

  render(<App />)
  await userEvent.type(await screen.findByLabelText('Username'), 'analyst')
  await userEvent.type(screen.getByLabelText('Password'), 'secret')
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

  expect(await screen.findByRole('heading', { name: /PANW analysis/i })).toBeInTheDocument()
  expect(opened).toContain('/api/runs/after-login/events')
})
