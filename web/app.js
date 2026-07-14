const numberFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 0,
})
let runtimePromise
let refreshing = false

const demoSummary = {
  openWork: 18,
  completedToday: 42,
  onTimeRate: 0.94,
  updatedAt: new Date().toISOString(),
  activity: [
    { item: 'Morning fulfillment wave', status: 'Complete', owner: 'Operations' },
    { item: 'Inventory exception review', status: 'In progress', owner: 'Merchandising' },
    { item: 'Carrier handoff', status: 'On track', owner: 'Logistics' },
  ],
}

function getRuntime() {
  runtimePromise ??= import('@shopped/app-runtime')
  return runtimePromise
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

function normalizedSummary(value) {
  const summary = value && typeof value === 'object' ? value : {}
  return {
    openWork: Number.isFinite(Number(summary.openWork)) ? Number(summary.openWork) : 0,
    completedToday: Number.isFinite(Number(summary.completedToday)) ? Number(summary.completedToday) : 0,
    onTimeRate: Number.isFinite(Number(summary.onTimeRate)) ? Number(summary.onTimeRate) : 0,
    updatedAt: typeof summary.updatedAt === 'string' ? summary.updatedAt : new Date().toISOString(),
    activity: Array.isArray(summary.activity) ? summary.activity.slice(0, 8) : [],
  }
}

function renderActivity(rows) {
  const body = document.querySelector('#activity')
  if (!body) return
  const fragment = document.createDocumentFragment()
  for (const row of rows) {
    const tr = document.createElement('tr')
    for (const value of [row.item, row.status, row.owner]) {
      const cell = document.createElement('td')
      cell.textContent = typeof value === 'string' && value ? value : '—'
      tr.appendChild(cell)
    }
    fragment.appendChild(tr)
  }
  body.replaceChildren(fragment)
}

function render(summary, session) {
  setText('[data-field="openWork"]', numberFormat.format(summary.openWork))
  setText('[data-field="completedToday"]', numberFormat.format(summary.completedToday))
  setText('[data-field="onTimeRate"]', percentFormat.format(summary.onTimeRate))
  setText('[data-field="updatedAt"]', new Date(summary.updatedAt).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit',
  }))
  renderActivity(summary.activity)
  const role = session?.workspace?.role
  setText('#session', role ? `Signed in · ${role}` : '')
  const action = document.querySelector('#session-action')
  if (action) action.hidden = true
  setStatus('Live data', 'good')
}

async function loadRemoteData() {
  const { serviceFetch, shopped } = await getRuntime()
  const [session, response] = await Promise.all([
    shopped.session.get(),
    serviceFetch('api', '/api/summary'),
  ])
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
  return { session, summary: normalizedSummary(payload) }
}

async function refresh() {
  if (refreshing) return
  refreshing = true
  const button = document.querySelector('#refresh')
  if (button) button.disabled = true
  setStatus('Refreshing…')
  try {
    const result = isLocalDemo()
      ? { session: { workspace: { role: 'local preview' } }, summary: demoSummary }
      : await loadRemoteData()
    render(normalizedSummary(result.summary), result.session)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Data is unavailable'
    const signInRequired = document.body.dataset.surface === 'standalone'
    const action = document.querySelector('#session-action')
    if (action) action.hidden = !signInRequired
    setStatus(signInRequired ? 'Sign in to load workspace data.' : message, 'bad')
  } finally {
    refreshing = false
    if (button) button.disabled = false
  }
}

document.querySelector('#refresh')?.addEventListener('click', () => void refresh())
document.querySelector('#session-action')?.addEventListener('click', async () => {
  const { shopped } = await getRuntime()
  await shopped.session.signIn()
})
void refresh()
