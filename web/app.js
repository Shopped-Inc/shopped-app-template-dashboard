const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 0,
})
let runtimePromise
let refreshing = false
let localDemoRefreshCount = 7

const demoSummary = {
  openWork: 18,
  completedToday: 42,
  onTimeRate: 0.94,
  refreshCount: localDemoRefreshCount,
  updatedAt: new Date().toISOString(),
  activity: [
    { item: 'Morning fulfillment wave', status: 'Complete', owner: 'Operations' },
    { item: 'Inventory exception review', status: 'In progress', owner: 'Merchandising' },
    { item: 'Carrier handoff', status: 'On track', owner: 'Logistics' },
    { item: 'Dashboard refreshes', status: '7 recorded', owner: 'Managed Postgres' },
  ],
}

export class DashboardRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'DashboardRequestError'
    this.status = status
  }
}

function getRuntime() {
  runtimePromise ??= import('@shopped/app-runtime')
  return runtimePromise
}

async function getComponentKit() {
  const [ReactModule, ReactDom, runtime] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    getRuntime(),
  ])
  return { React: ReactModule.default ?? ReactModule, createRoot: ReactDom.createRoot, runtime }
}

function isLocalDemo() {
  const loopback = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  return loopback && new URLSearchParams(location.search).get('demo') === '1'
}

function setText(selector, value) {
  for (const element of document.querySelectorAll(selector)) element.textContent = value
}

function setStatus(message, tone = 'neutral') {
  const status = document.querySelector('#status')
  if (!status) return
  status.textContent = message
  status.dataset.tone = tone
}

function safeActivityRow(value) {
  const row = value && typeof value === 'object' ? value : {}
  const text = field => typeof row[field] === 'string' && row[field] ? row[field] : '—'
  return { item: text('item'), status: text('status'), owner: text('owner') }
}

export function normalizedSummary(value) {
  const summary = value && typeof value === 'object' ? value : {}
  return {
    openWork: Number.isFinite(Number(summary.openWork)) ? Number(summary.openWork) : 0,
    completedToday: Number.isFinite(Number(summary.completedToday)) ? Number(summary.completedToday) : 0,
    onTimeRate: Number.isFinite(Number(summary.onTimeRate)) ? Number(summary.onTimeRate) : 0,
    refreshCount: Number.isFinite(Number(summary.refreshCount)) ? Number(summary.refreshCount) : 0,
    updatedAt: typeof summary.updatedAt === 'string' ? summary.updatedAt : new Date().toISOString(),
    activity: Array.isArray(summary.activity)
      ? summary.activity.slice(0, 8).map(safeActivityRow)
      : [],
  }
}

export function shouldOfferSignIn(error, surface) {
  return surface === 'standalone' && Number(error?.status) === 401
}

function renderActivity(rows) {
  const body = document.querySelector('#activity')
  if (!body) return
  const fragment = document.createDocumentFragment()
  for (const row of rows) {
    const tr = document.createElement('tr')
    for (const value of [row.item, row.status, row.owner]) {
      const cell = document.createElement('td')
      cell.textContent = value
      tr.appendChild(cell)
    }
    fragment.appendChild(tr)
  }
  body.replaceChildren(fragment)
}

function formattedUpdate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'just now'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function renderFallback(summary, session) {
  setText('[data-field="openWork"]', numberFormat.format(summary.openWork))
  setText('[data-field="completedToday"]', numberFormat.format(summary.completedToday))
  setText('[data-field="onTimeRate"]', percentFormat.format(summary.onTimeRate))
  setText('[data-field="refreshCount"]', numberFormat.format(summary.refreshCount))
  setText('[data-field="updatedAt"]', formattedUpdate(summary.updatedAt))
  renderActivity(summary.activity)
  const role = session?.workspace?.role
  setText('#session', role ? `Signed in · ${role}` : '')
  const action = document.querySelector('#session-action')
  if (action) action.hidden = true
  setStatus('Demo data · publish to connect managed Postgres', 'good')
}

export async function requestRemoteDashboard(runtime, { recordRefresh = false } = {}) {
  const path = recordRefresh ? '/api/summary/refresh' : '/api/summary'
  const init = recordRefresh ? { method: 'POST' } : undefined
  const [session, response] = await Promise.all([
    runtime.shopped.session.get(),
    runtime.serviceFetch('api', path, init),
  ])
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new DashboardRequestError(
      payload?.error || `Backend request failed (HTTP ${response.status})`,
      response.status,
    )
  }
  return { session, summary: normalizedSummary(payload) }
}

async function refreshLocalFallback({ recordRefresh = false } = {}) {
  if (refreshing) return
  refreshing = true
  const button = document.querySelector('#refresh')
  if (button) button.disabled = true
  setStatus('Loading demo data…')
  try {
    if (recordRefresh) localDemoRefreshCount += 1
    const summary = normalizedSummary({
      ...demoSummary,
      refreshCount: localDemoRefreshCount,
      updatedAt: new Date().toISOString(),
      activity: demoSummary.activity.map((row, index) => index === 3
        ? { ...row, status: `${localDemoRefreshCount} recorded` }
        : row),
    })
    renderFallback(summary, { workspace: { role: 'local preview' } })
  } finally {
    refreshing = false
    if (button) button.disabled = false
  }
}

function createDashboardComponent(React, runtime, surface) {
  const h = React.createElement
  const { useCallback, useEffect, useState } = React
  const {
    Badge,
    Button,
    Card,
    DataTable,
    Grid,
    MetricCard,
    Page,
  } = runtime

  const metricCards = (summary, variant = 'default') => [
    h(MetricCard, { key: 'open', label: 'Open work', value: numberFormat.format(summary.openWork), span: 3, variant }),
    h(MetricCard, { key: 'done', label: 'Completed today', value: numberFormat.format(summary.completedToday), span: 3, variant, valueTone: 'good' }),
    h(MetricCard, { key: 'rate', label: 'On-time rate', value: percentFormat.format(summary.onTimeRate), span: 3, variant, valueTone: 'info' }),
    h(MetricCard, { key: 'refresh', label: 'Recorded refreshes', value: numberFormat.format(summary.refreshCount), span: 3, variant }),
  ]

  return function DashboardApp() {
    const [state, setState] = useState({
      summary: normalizedSummary(demoSummary),
      session: null,
      loading: true,
      error: null,
    })

    const load = useCallback(async recordRefresh => {
      setState(current => ({ ...current, loading: true, error: null }))
      try {
        const result = await requestRemoteDashboard(runtime, { recordRefresh })
        setState({ ...result, loading: false, error: null })
      } catch (error) {
        const requestError = error instanceof Error
          ? error
          : new Error('Dashboard data is unavailable.')
        setState(current => ({ ...current, loading: false, error: requestError }))
      }
    }, [])

    useEffect(() => {
      void load(false)
    }, [load])

    const { summary, session, loading, error } = state
    const signInRequired = shouldOfferSignIn(error, surface)
    let statusText = 'Live data · persisted in managed Postgres'
    let statusTone = 'good'
    let statusLabel = 'Connected'
    if (loading) {
      statusText = 'Loading live data…'
      statusTone = 'neutral'
      statusLabel = 'Loading'
    } else if (error) {
      statusText = error.message
      statusTone = 'bad'
      statusLabel = 'Needs attention'
    }
    const refresh = h(Button, {
      disabled: loading,
      onClick: () => void load(true),
      'aria-label': 'Refresh dashboard and record it in Postgres',
    }, loading ? 'Refreshing…' : 'Refresh')
    const status = h(Card, { span: 12, pad: 'sm', className: 'template-kit-status' },
      h(Badge, { tone: statusTone }, statusLabel),
      h('span', null, statusText),
      session?.workspace?.role
        ? h('span', { className: 'template-kit-session' }, `Signed in · ${session.workspace.role}`)
        : null,
      signInRequired
        ? h(Button, { variant: 'primary', onClick: () => void runtime.shopped.session.signIn() }, 'Sign in with Shopped')
        : null,
    )

    if (surface === 'widget') {
      return h(Page, {
        title: 'Status',
        eyebrow: 'Operations',
        actions: refresh,
        className: 'template-kit-page template-kit-widget',
      },
      h(Grid, { columns: 12 },
        h(MetricCard, {
          label: 'Open work items',
          value: numberFormat.format(summary.openWork),
          caption: `${numberFormat.format(summary.refreshCount)} persisted refreshes`,
          variant: 'hero',
          span: 12,
        }),
        status,
      ))
    }

    if (surface === 'card') {
      return h(Page, {
        title: "Today's work",
        eyebrow: 'Operations',
        actions: refresh,
        className: 'template-kit-page template-kit-card',
      },
      h(Grid, { columns: 12 }, ...metricCards(summary, 'compact'), status),
      h('p', { className: 'template-kit-updated' }, `Updated ${formattedUpdate(summary.updatedAt)}`))
    }

    return h(Page, {
      title: 'Dashboard',
      subtitle: "A live view of today's workload and service health.",
      eyebrow: 'Operations',
      actions: refresh,
      className: 'template-kit-page',
    },
    h(Grid, { columns: 12 }, ...metricCards(summary), status),
    h(Card, {
      title: 'Latest updates',
      eyebrow: 'Recent activity',
      subtitle: `Updated ${formattedUpdate(summary.updatedAt)}`,
    },
    h(DataTable, {
      columns: [
        { key: 'item', label: 'Work item' },
        { key: 'status', label: 'Status' },
        { key: 'owner', label: 'Owner' },
      ],
      rows: summary.activity,
      empty: 'No recent activity',
    })))
  }
}

async function mountComponentApp() {
  const rootElement = document.querySelector('#app-root')
  if (!rootElement) throw new Error('Dashboard root element is missing.')
  const surface = document.body.dataset.surface || 'standalone'
  const { React, createRoot, runtime } = await getComponentKit()
  const DashboardApp = createDashboardComponent(React, runtime, surface)
  createRoot(rootElement).render(React.createElement(DashboardApp))
}

if (typeof document !== 'undefined') {
  if (isLocalDemo()) {
    document.querySelector('#refresh')?.addEventListener('click', () => {
      void refreshLocalFallback({ recordRefresh: true })
    })
    void refreshLocalFallback()
  } else {
    void mountComponentApp().catch(error => {
      const message = error instanceof Error ? error.message : 'The app runtime could not load.'
      setStatus(message, 'bad')
    })
  }
}
