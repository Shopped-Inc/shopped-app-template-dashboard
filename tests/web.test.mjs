import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DashboardRequestError,
  normalizedSummary,
  requestRemoteDashboard,
  shouldOfferSignIn,
} from '../web/app.js'

function runtimeWithResponse(response, calls) {
  return {
    shopped: {
      session: {
        async get() { return { workspace: { role: 'member' } } },
      },
    },
    async serviceFetch(name, path, init) {
      calls.push({ name, path, init })
      return response
    },
  }
}

test('normalizes persisted service values without trusting their shape', () => {
  const summary = normalizedSummary({
    openWork: '18',
    completedToday: 42,
    onTimeRate: '0.94',
    refreshCount: '9',
    updatedAt: '2026-07-13T12:00:00.000Z',
    activity: new Array(12).fill({ item: 'x' }),
  })
  assert.equal(summary.openWork, 18)
  assert.equal(summary.onTimeRate, 0.94)
  assert.equal(summary.refreshCount, 9)
  assert.equal(summary.activity.length, 8)
})

test('initial load reads and explicit refresh performs a POST write', async () => {
  const calls = []
  const payload = {
    openWork: 18,
    completedToday: 42,
    onTimeRate: 0.94,
    refreshCount: 1,
    updatedAt: '2026-07-13T12:00:00.000Z',
    activity: [],
  }
  const readRuntime = runtimeWithResponse(Response.json(payload), calls)
  await requestRemoteDashboard(readRuntime)
  assert.deepEqual(calls[0], { name: 'api', path: '/api/summary', init: undefined })

  const writeRuntime = runtimeWithResponse(Response.json(payload), calls)
  await requestRemoteDashboard(writeRuntime, { recordRefresh: true })
  assert.deepEqual(calls[1], {
    name: 'api',
    path: '/api/summary/refresh',
    init: { method: 'POST' },
  })
})

test('only a standalone 401 is presented as a sign-in problem', async () => {
  const runtime = runtimeWithResponse(
    Response.json({ error: 'Database unavailable' }, { status: 503 }),
    [],
  )
  await assert.rejects(
    requestRemoteDashboard(runtime),
    error => error instanceof DashboardRequestError
      && error.status === 503
      && error.message === 'Database unavailable',
  )
  assert.equal(shouldOfferSignIn(new DashboardRequestError('No session', 401), 'standalone'), true)
  assert.equal(shouldOfferSignIn(new DashboardRequestError('Forbidden', 403), 'standalone'), false)
  assert.equal(shouldOfferSignIn(new DashboardRequestError('No session', 401), 'card'), false)
  assert.equal(shouldOfferSignIn(new DashboardRequestError('Database unavailable', 503), 'standalone'), false)
})
