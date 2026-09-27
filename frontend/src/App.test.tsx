import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

async function openVisualReport(sections: Record<string, string>) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
    if (url.endsWith('/api/runs')) return ok([{ id: 'chart', ticker: 'NVDA', analysis_date: '2026-09-25', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-25' }])
    if (url.endsWith('/api/runs/chart')) return ok({ id: 'chart', ticker: 'NVDA', analysis_date: '2026-09-25', depth: 3, status: 'done', rating: 'Buy', sections })
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show NVDA report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /open NVDA/i }))
  await screen.findByText('FINAL RATING')
}

test('charts explicit market scenarios and numeric sentiment above report text without invented odds', async () => {
  await openVisualReport({
    market_report: '### Bullish Scenario (Primary Bias)\n- **Trigger:** Close over $228.87\n### Bearish / Invalidation Scenario\n- **Trigger:** Breakdown below $221.65',
    sentiment_report: '**Overall Sentiment:** **Mildly Bullish** (Score: 5.8/10)\n\n### Signals\nMixed evidence',
  })
  const chart = screen.getByRole('region', { name: 'Report visualizations' })
  expect(chart).toHaveTextContent('Primary bias')
  expect(chart).toHaveTextContent('Conditional / invalidation')
  expect(chart).toHaveTextContent('Bullish Scenario')
  expect(chart).toHaveTextContent('Bearish / Invalidation Scenario')
  expect(chart).toHaveTextContent('Mildly Bullish')
  expect(chart).toHaveTextContent('5.8/10')
  expect(chart.querySelector('[role="meter"]')).toHaveAttribute('aria-valuenow', '5.8')
  expect(chart.querySelector('[role="meter"]')).toHaveAttribute('aria-valuemax', '10')
  expect(chart.querySelector('[role="meter"] .sentiment-fill')).toHaveAttribute('style', 'width: 58%;')
  expect(chart.textContent).not.toMatch(/probability|chance|%/i)
  expect(chart.compareDocumentPosition(screen.getByRole('navigation', { name: 'Report contents' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Bullish Scenario (Primary Bias)' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /raw/i }))
  expect(screen.queryByRole('region', { name: 'Report visualizations' })).not.toBeInTheDocument()
  expect(screen.getByText(/### Bullish Scenario \(Primary Bias\)/)).toBeInTheDocument()
})

test('charts a directly labelled bearish prediction without requiring paired scenarios', async () => {
  await openVisualReport({ market_report: '**Market Prediction:** **Bearish**\nThe report outlines a conditional recovery case.' })
  const chart = screen.getByRole('region', { name: 'Report visualizations' })
  expect(chart).toHaveTextContent('Bearish')
  expect(chart).toHaveTextContent('Reported direction')
  expect(chart.querySelectorAll('.scenario-lane')).toHaveLength(1)
  expect(chart.textContent).not.toMatch(/probability|%/i)
})

test('shows unavailable for absent or malformed explicit chart data, not debate rhetoric or stray numbers', async () => {
  await openVisualReport({
    '1_analysts_market': 'Bull and bear debate: bullish case has 80% upside.\n### Bullish Scenario\nNo bearish scenario here.',
    '1_analysts_sentiment': '**Overall Sentiment:** Bullish (Score: 12/10)\n\n### Bullish/Bearish discussion\n5.8/10 mentioned in a quote.',
  })
  const chart = screen.getByRole('region', { name: 'Report visualizations' })
  expect(chart).toHaveTextContent('Market scenarios')
  expect(chart).toHaveTextContent('Overall sentiment')
  expect(chart.querySelectorAll('[role="meter"]')).toHaveLength(0)
  expect(chart.querySelectorAll('.scenario-lane')).toHaveLength(0)
  expect(chart.querySelectorAll('.visual-unavailable')).toHaveLength(2)
})

test('supports legacy section keys with explicit scenarios and sentiment, rejecting a score without label', async () => {
  await openVisualReport({
    '1_analysts_market': '### Bearish Scenario (Primary Bias)\n- Falling\n### Bullish Scenario (Conditional)\n- Recovery',
    '1_analysts_sentiment': '**Overall Sentiment:** Neutral (Score: 0/5)',
  })
  const chart = screen.getByRole('region', { name: 'Report visualizations' })
  expect(chart.querySelectorAll('.scenario-lane')).toHaveLength(2)
  expect(chart).toHaveTextContent('Neutral')
  expect(chart.querySelector('[role="meter"]')).toHaveAttribute('aria-valuemax', '5')
  expect(chart.querySelector('[role="meter"]')).toHaveAttribute('aria-valuenow', '0')
})

test('does not infer sentiment from an unlabelled score or show charts without source sections', async () => {
  await openVisualReport({ sentiment_report: '### Bullish/Bearish debate\nScore: 5.8/10\nOverall sentiment appears positive.' })
  const chart = screen.getByRole('region', { name: 'Report visualizations' })
  expect(chart.querySelector('[role="meter"]')).toBeNull()
  expect(chart).toHaveTextContent('Not available')
  cleanup()
  await openVisualReport({ final_trade_decision: 'Bullish case against bearish case. 5.8/10.' })
  expect(screen.queryByRole('region', { name: 'Report visualizations' })).not.toBeInTheDocument()
})

afterEach(() => cleanup())

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  }))
})

test('opens analysis dashboard from the menu using saved overview data', async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/overview')) return ok({
      budget: 105, cash: 55,
      counts: { buy: 1, hold: 0, sell: 0, unknown: 0 },
      rows: [{ id: 'run-mu', ticker: 'MU', analysis_date: '2026-09-24', rating: 'Buy', score: null, action: 'WAIT FOR PULLBACK', horizon: 'Not available', allocation: 50, entry: '$1,040', tp1: 'Not available', tp2: 'Not available', stop_loss: '$950', risk_reward: 'Not available', confidence: 'Not available', invalidation: 'Not available', time_stop: 'Review at next contribution', risk_dollars: null, stop_distance_pct: 8.65, rationale: 'Await a verified entry', caveat: 'Not a live quote' }],
    })
    if (url.endsWith('/api/runs')) return ok([{ id: 'run-mu', ticker: 'MU', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24' }])
    if (url.endsWith('/api/runs/run-mu')) return ok({ id: 'run-mu', ticker: 'MU', analysis_date: '2026-09-24', rating: 'Buy', sections: { final_trade_decision: '**Rating**: Buy' } })
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /analysis dashboard/i }))
  expect(await screen.findByRole('heading', { name: 'Monthly allocation plan' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /monthly allocation: MU \$50.*cash \$55/i })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Allocation' })).toHaveTextContent('$105.00')
  await userEvent.click(screen.getByRole('button', { name: /open MU report/i }))
  expect(await screen.findByText('FINAL RATING')).toBeInTheDocument()
})

test('does not show a stale dashboard after a failed refresh or a superseded response', async () => {
  let resolveFirst!: (value: Response) => void
  let attempts = 0
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([])
    if (url.endsWith('/api/overview')) {
      attempts++
      if (attempts === 1) return new Promise(resolve => { resolveFirst = resolve })
      if (attempts === 2) return ok({ budget: 105, cash: 105, counts: { buy: 0, hold: 0, sell: 0, unknown: 0 }, rows: [] })
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Overview unavailable' }) } as Response)
    }
    return ok({})
  })
  render(<App />)
  const dashboard = await screen.findByRole('button', { name: /analysis dashboard/i })
  await userEvent.click(dashboard)
  await userEvent.click(dashboard)
  expect((await screen.findAllByText(/No completed analyses available/i)).length).toBeGreaterThan(0)
  await act(async () => { resolveFirst({ ok: true, json: async () => ({ budget: 105, cash: 0, counts: { buy: 1, hold: 0, sell: 0, unknown: 0 }, rows: [{ id: 'stale', ticker: 'STALE', allocation: 105 }] }) } as Response) })
  expect(screen.queryAllByText('STALE')).toHaveLength(0)
  await userEvent.click(dashboard)
  expect(await screen.findByRole('alert')).toHaveTextContent('Overview unavailable')
  expect(screen.queryAllByText('STALE')).toHaveLength(0)
  expect(screen.queryByRole('heading', { name: 'Conditional overview' })).not.toBeInTheDocument()
})

test('clears dashboard charts when a completed run cannot refresh saved history', async () => {
  let historyReads = 0
  class LiveEventSource {
    static instance: LiveEventSource
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor() { LiveEventSource.instance = this }
    close() {}
    emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent) }
  }
  vi.stubGlobal('EventSource', LiveEventSource)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/jobs')) return ok([{ id: 'job-one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 1 }])
    if (url.endsWith('/api/runs')) {
      historyReads++
      return historyReads === 1 ? ok([]) : Promise.resolve(new Response(JSON.stringify({ detail: 'History unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
    }
    if (url.endsWith('/api/overview')) return ok({ budget: 105, cash: 105, counts: { buy: 1, hold: 0, sell: 0, unknown: 0 }, rows: [] })
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /analysis dashboard/i }))
  expect(await screen.findByRole('heading', { name: /rating distribution/i })).toBeInTheDocument()
  act(() => LiveEventSource.instance.emit({ id: 'job-one', status: 'done', type: 'status', message: 'Done' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
  expect(screen.queryByRole('heading', { name: /rating distribution/i })).not.toBeInTheDocument()
})

test('shows exact depth meanings and validates free-text ticker', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Financial Halucination' })).toBeInTheDocument()
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
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  expect(await screen.findByText('Overweight')).toBeInTheDocument()
  expect(screen.getByText(/Depth not available/)).toBeInTheDocument()
  expect(screen.queryByText(/DNot available/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open AMD 2026-09-24 report' }))
  expect(await screen.findByRole('heading', { name: 'Market' })).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
})

test('groups saved runs by alphabetized ticker and reveals dates on tap', async () => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([
      { id: 'tsm-new', ticker: 'TSM', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24' },
      { id: 'amd', ticker: 'AMD', analysis_date: '2026-09-22', depth: 1, status: 'done', rating: 'Hold', created_at: '2026-09-22' },
      { id: 'tsm-old', ticker: 'TSM', analysis_date: '2026-09-20', depth: 5, status: 'done', rating: 'Sell', created_at: '2026-09-20' },
    ])
    return ok({})
  })

  render(<App />)
  const groups = await screen.findAllByRole('button', { name: /show .* report dates/i })
  expect(groups.map(group => group.textContent)).toEqual(['AMD1', 'TSM2'])
  expect(screen.queryByRole('button', { name: /open TSM 2026-09-24/i })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /show TSM report dates/i }))
  const dates = screen.getAllByRole('button', { name: /open TSM/i })
  expect(dates.map(button => button.getAttribute('aria-label'))).toEqual([
    'Open TSM 2026-09-24 report',
    'Open TSM 2026-09-20 report',
  ])
})

test('removes only the selected ticker date after confirmation', async () => {
  let history = [{ id: 'amd-date', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24' }]
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs/amd-date') && init?.method === 'DELETE') {
      history = []
      return ok(undefined, 204)
    }
    if (url.endsWith('/api/runs')) return ok(history)
    return ok({})
  })

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /remove AMD 2026-09-24 report/i }))

  expect(window.confirm).toHaveBeenCalledWith('Remove the AMD analysis for 2026-09-24 from history? Report files will be kept.')
  expect(fetch).toHaveBeenCalledWith('/api/runs/amd-date', expect.objectContaining({
    method: 'DELETE',
    headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
  }))
  expect(await screen.findByText('No completed runs.')).toBeInTheDocument()
})

test('disambiguates same-date reruns and keeps newer selection during pending deletion', async () => {
  const history = [
    { id: 'older', ticker: 'AMD', analysis_date: '2026-09-24', depth: 1, status: 'done', rating: 'Hold', created_at: '2026-09-24T10:00:00Z' },
    { id: 'newer', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24T11:00:00Z' },
  ]
  let resolveDelete: ((response: Response) => void) | undefined
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs/older') && init?.method === 'DELETE') return new Promise(resolve => { resolveDelete = resolve })
    if (url.endsWith('/api/runs')) return ok(history)
    if (url.endsWith('/api/runs/older')) return ok({ ...history[0], sections: { market_report: 'Older report' } })
    if (url.endsWith('/api/runs/newer')) return ok({ ...history[1], sections: { market_report: 'Newer report' } })
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  const removes = screen.getAllByRole('button', { name: /remove AMD 2026-09-24/i })
  expect(new Set(removes.map(button => button.getAttribute('aria-label'))).size).toBe(2)
  await userEvent.click(screen.getByRole('button', { name: /open AMD 2026-09-24.*10:00/i }))
  expect(await screen.findByText('Older report')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /remove AMD 2026-09-24.*10:00/i }))
  expect(resolveDelete).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: /open AMD 2026-09-24.*11:00/i }))
  expect(await screen.findByText('Newer report')).toBeInTheDocument()
  await act(async () => resolveDelete!(new Response(null, { status: 204 })))
  expect(screen.getByText('Newer report')).toBeInTheDocument()
})

test('distinguishes a same-date rerun in the history removal confirmation', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([
      { id: 'older', ticker: 'AMD', analysis_date: '2026-09-24', depth: 1, status: 'done', rating: 'Hold', created_at: '2026-09-24T10:00:00Z' },
      { id: 'newer', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24T11:00:00Z' },
    ])
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /Remove AMD 2026-09-24 2026-09-24T11:00:00Z report/i }))
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('2026-09-24T11:00:00Z'))
  confirm.mockRestore()
})

test('shows long same-date rerun metadata, depth, verdict and separate remove actions', async () => {
  const timestamp = '2026-09-24T11:00:00.123456789+07:00'
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    if (String(input).endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (String(input).endsWith('/api/runs')) return ok([
      { id: 'older', ticker: 'AMD', analysis_date: '2026-09-24', depth: 1, status: 'done', rating: 'Hold', created_at: '2026-09-24T10:00:00Z' },
      { id: 'newer', ticker: 'AMD', analysis_date: '2026-09-24', depth: 5, status: 'done', rating: 'Strong Buy', created_at: timestamp },
    ])
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  const open = screen.getByRole('button', { name: `Open AMD 2026-09-24 ${timestamp} report` })
  expect(open.querySelector('time')).toHaveTextContent('2026-09-24')
  expect(open.querySelector('.history-created')).toHaveTextContent(timestamp)
  expect(open.querySelector('.history-depth')).toHaveTextContent('D5')
  expect(open.querySelector('.rating')).toHaveTextContent('Strong Buy')
  expect(screen.getByRole('button', { name: `Remove AMD 2026-09-24 ${timestamp} report` })).toHaveAttribute('title', 'Remove this saved analysis')
})

test('uses Financial Halucination on login', async () => {
  vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(null, { status: 401 })))
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Financial Halucination' })).toBeInTheDocument()
})

test('keeps deleted history absent when overlapping refreshes resolve out of order', async () => {
  let resolveOld!: (value: Response) => void
  let reads = 0
  const amd = { id: 'run-amd', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24T12:00:00Z' }
  const tsm = { ...amd, id: 'run-tsm', ticker: 'TSM' }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && init?.method === undefined) {
      reads++
      if (reads === 1) return ok([amd, tsm])
      if (reads === 2) return new Promise(resolve => { resolveOld = resolve })
      return ok([])
    }
    if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /Remove AMD 2026-09-24 report/i }))
  await userEvent.click(screen.getByRole('button', { name: /show TSM report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /Remove TSM 2026-09-24 report/i }))
  expect(await screen.findByText('No completed runs.')).toBeInTheDocument()
  await act(async () => { resolveOld(new Response(JSON.stringify([tsm]), { status: 200, headers: { 'Content-Type': 'application/json' } })) })
  expect(screen.queryByRole('button', { name: /show TSM report dates/i })).not.toBeInTheDocument()
})

test('keeps a successfully deleted report removed if history refresh fails', async () => {
  let reads = 0
  const record = { id: 'run-amd', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24T12:00:00Z' }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs') && !init?.method) return ++reads === 1 ? ok([record]) : Promise.resolve(new Response(JSON.stringify({ detail: 'History unavailable' }), { status: 503 }))
    if (url.endsWith('/api/runs/run-amd') && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /Remove AMD 2026-09-24 report/i }))
  expect(await screen.findByText('No completed runs.')).toBeInTheDocument()
  expect(screen.queryByText(/Unable to remove report|History unavailable/i)).not.toBeInTheDocument()
})

test('does not reopen a deleted report from a late completed-run response', async () => {
  let resolveReport!: (value: Response) => void
  const record = { id: 'report-abc', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24T12:00:00Z' }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/jobs')) return ok([{ ...record, id: 'job-one', status: 'running' }])
    if (url.endsWith('/api/runs') && !init?.method) return ok([record])
    if (url.endsWith('/api/runs/report-abc') && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    if (url.endsWith('/api/runs/job-one')) return new Promise(resolve => { resolveReport = resolve })
    return ok({})
  })
  class FakeEventSource {
    static instance: FakeEventSource
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    constructor() { FakeEventSource.instance = this }
    close() {}
  }
  vi.stubGlobal('EventSource', FakeEventSource)
  render(<App />)
  await screen.findByRole('button', { name: /show AMD report dates/i })
  await act(async () => FakeEventSource.instance.onmessage?.({ data: JSON.stringify({ id: 'job-one', status: 'done', message: 'Analysis complete' }) } as MessageEvent))
  await userEvent.click(screen.getByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /Remove AMD 2026-09-24 report/i }))
  await act(async () => resolveReport(new Response(JSON.stringify({ ...record, sections: { final_trade_decision: 'Rating: Buy' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  expect(screen.queryByText('FINAL RATING')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /open AMD 2026-09-24 report/i })).not.toBeInTheDocument()
})

test('does not reopen a hidden report when a completed job lookup resolves late', async () => {
  let resolveReport!: (response: Response) => void
  const record = { id: 'report-abc', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Hold', created_at: '2026-09-24T12:00:00Z', sections: { final_trade_decision: 'Hidden report' } }
  class LiveEventSource {
    static instance: LiveEventSource
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor() { LiveEventSource.instance = this }
    close() {}
    emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent) }
  }
  vi.stubGlobal('EventSource', LiveEventSource)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/jobs')) return ok([{ id: 'job-one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 1 }])
    if (url.endsWith('/api/runs')) return ok([record])
    if (url.endsWith('/api/runs/report-abc') && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    if (url.endsWith('/api/runs/report-abc')) return ok(record)
    if (url.endsWith('/api/runs/job-one')) return new Promise(resolve => { resolveReport = resolve })
    return ok({})
  })

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /open AMD 2026-09-24 report/i }))
  act(() => LiveEventSource.instance.emit({ id: 'job-one', status: 'done', type: 'status', message: 'Done' }))
  await userEvent.click(screen.getByRole('button', { name: /inspect AMD/i }))
  await userEvent.click(await screen.findByRole('button', { name: /open completed report/i }))
  expect(resolveReport).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: /remove AMD 2026-09-24 report/i }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /remove AMD 2026-09-24 report/i })).not.toBeInTheDocument())
  await act(async () => resolveReport(await ok(record)))
  expect(screen.queryByText('Hidden report')).not.toBeInTheDocument()
})

test('uses the most recently requested saved report when requests finish out of order', async () => {
  let resolveFirst!: (response: Response) => void
  const first = { id: 'report-amd', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Hold', created_at: '2026-09-24T12:00:00Z', sections: { final_trade_decision: 'First report' } }
  const second = { ...first, id: 'report-tsm', ticker: 'TSM', sections: { final_trade_decision: 'Second report' } }
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok([first, second])
    if (url.endsWith('/api/runs/report-amd')) return new Promise(resolve => { resolveFirst = resolve })
    if (url.endsWith('/api/runs/report-tsm')) return ok(second)
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /open AMD 2026-09-24 report/i }))
  await userEvent.click(screen.getByRole('button', { name: /show TSM report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: /open TSM 2026-09-24 report/i }))
  expect(await screen.findByText('Second report')).toBeInTheDocument()
  await act(async () => resolveFirst(await ok(first)))
  expect(screen.getByText('Second report')).toBeInTheDocument()
  expect(screen.queryByText('First report')).not.toBeInTheDocument()
})

test('opens the completed report when a live run finishes', async () => {
  let historyCalls = 0
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
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
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Open AMD 2026-09-24 report' }))

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
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
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
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
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
    if (url.endsWith('/api/models')) return ok({ models: ['glm-5.3'], default_model: 'glm-5.3' })
    if (url.endsWith('/api/runs') && init?.method === 'POST') return ok({ id: 'job-live', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'running', elapsed_seconds: 1 }, 202)
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })

  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /run analysis/i }))
  act(() => LiveEventSource.instance.emit({ id: 'job-live', status: 'running', elapsed_seconds: 2, type: 'agent', message: 'Bull Researcher: Building the growth case' }, '0'))
  expect(screen.getByRole('log', { name: /AMD live activity/i })).toBeInTheDocument()
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
      { id: 'restored-queued', ticker: 'AVGO', analysis_date: '2026-09-24', depth: 3, status: 'queued', elapsed_seconds: 3, llm_model: 'glm-5.3-flash' },
      { id: 'restored-running', ticker: 'MU', analysis_date: '2026-09-24', depth: 5, status: 'running', elapsed_seconds: 20 },
      { id: 'old-done', ticker: 'SPY', analysis_date: '2026-09-23', depth: 1, status: 'done', elapsed_seconds: 30 },
    ])
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })

  render(<App />)

  expect(await screen.findByRole('heading', { name: /AVGO analysis/i })).toBeInTheDocument()
  expect(screen.getByText('LLM model: glm-5.3-flash', { selector: '.job-model' })).toBeInTheDocument()
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

test('loads authenticated models, selects the server default and posts the exact chosen model with CSRF', async () => {
  let resolveModels!: (response: Response) => void
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/models')) return new Promise(resolve => { resolveModels = resolve })
    if (url.endsWith('/api/runs') && init?.method === 'POST') return ok({ id: 'job-model', status: 'queued', llm_model: 'DeepSeek-V4-Pro' }, 202)
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })
  class IdleEventSource { close() {} }
  vi.stubGlobal('EventSource', IdleEventSource)
  render(<App />)
  const start = await screen.findByRole('button', { name: /run analysis/i })
  expect(start).toBeDisabled()
  expect(fetch).toHaveBeenCalledWith('/api/models', expect.anything())
  await act(async () => resolveModels(await ok({ models: ['deepseek-v4-pro-0813', 'DeepSeek-V4-Pro'], default_model: 'deepseek-v4-pro-0813' })))
  const model = screen.getByRole('combobox', { name: 'LLM model' })
  expect(model).toHaveValue('deepseek-v4-pro-0813')
  expect(screen.getAllByRole('option').map(option => option.getAttribute('value'))).toEqual(['', 'deepseek-v4-pro-0813', 'DeepSeek-V4-Pro'])
  await userEvent.selectOptions(model, 'DeepSeek-V4-Pro')
  await userEvent.click(start)
  expect(fetch).toHaveBeenCalledWith('/api/runs', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
    body: expect.stringContaining('"llm_model":"DeepSeek-V4-Pro"'),
  }))
  expect(await screen.findByText(/LLM model: DeepSeek-V4-Pro/, { selector: '.job-model' })).toBeInTheDocument()
})

test('requires a choice without a valid server default and permits retry after models fail', async () => {
  let reads = 0
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/models')) return ++reads === 1 ? ok({ detail: 'Unavailable' }, 503) : ok({ models: ['qwen3.8-max'], default_model: null })
    if (url.endsWith('/api/runs')) return ok([])
    return ok({})
  })
  render(<App />)
  const start = await screen.findByRole('button', { name: /run analysis/i })
  expect(start).toBeDisabled()
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  const model = screen.getByRole('combobox', { name: 'LLM model' })
  await waitFor(() => expect(model).toBeEnabled())
  expect(model).toHaveValue('')
  expect(start).toBeDisabled()
  await userEvent.selectOptions(model, 'qwen3.8-max')
  expect(start).toBeEnabled()
})

test('shows saved model from list and detail, with a legacy fallback in both places', async () => {
  const reports = [
    { id: 'one', ticker: 'AMD', analysis_date: '2026-09-24', depth: 3, status: 'done', rating: 'Buy', created_at: '2026-09-24', llm_model: 'gemini-3.8-flash-high' },
    { id: 'two', ticker: 'MU', analysis_date: '2026-09-23', depth: 3, status: 'done', rating: 'Hold', created_at: '2026-09-23' },
  ]
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/session')) return ok({ username: 'analyst', csrf_token: 'csrf' })
    if (url.endsWith('/api/runs')) return ok(reports)
    if (url.endsWith('/api/runs/one')) return ok({ ...reports[0], sections: {} })
    if (url.endsWith('/api/runs/two')) return ok({ ...reports[1], sections: {} })
    return ok({})
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /show AMD report dates/i }))
  expect(screen.getByText('LLM model: gemini-3.8-flash-high', { selector: '.history-model' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /open AMD/i }))
  expect(await screen.findByText('gemini-3.8-flash-high', { selector: '.report-model' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /show MU report dates/i }))
  expect(screen.getByText('LLM model: Not available', { selector: '.history-model' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /open MU/i }))
  expect(await screen.findByText('Not available', { selector: '.report-model' })).toBeInTheDocument()
})
