import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import { createDashboardServer } from '../services/api/server.mjs'

const baseSummary = {
  openWork: 18,
  completedToday: 42,
  onTimeRate: 0.94,
  refreshCount: 0,
  updatedAt: '2026-07-13T12:00:00.000Z',
  activity: [],
}

async function serve(t, store, logger = console) {
  const server = createDashboardServer({ store, logger })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  assert(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

test('health checks the database before reporting ready', async t => {
  let healthChecks = 0
  const url = await serve(t, {
    async health() { healthChecks += 1 },
    async getSummary() { return baseSummary },
    async recordRefresh() { return baseSummary },
  })

  const response = await fetch(`${url}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, database: 'ready' })
  assert.equal(healthChecks, 1)
})

test('summary reads state and refresh records a persistent write', async t => {
  let refreshCount = 3
  const store = {
    async health() {},
    async getSummary() { return { ...baseSummary, refreshCount } },
    async recordRefresh() {
      refreshCount += 1
      return { ...baseSummary, refreshCount }
    },
  }
  const url = await serve(t, store)

  const before = await fetch(`${url}/api/summary`)
  assert.equal(before.status, 200)
  assert.equal((await before.json()).refreshCount, 3)

  const refreshed = await fetch(`${url}/api/summary/refresh`, { method: 'POST' })
  assert.equal(refreshed.status, 200)
  assert.equal((await refreshed.json()).refreshCount, 4)

  const after = await fetch(`${url}/api/summary`)
  assert.equal((await after.json()).refreshCount, 4)
})

test('routes reject unsafe methods and hide backend error details', async t => {
  const errors = []
  const url = await serve(t, {
    async health() {},
    async getSummary() { throw new Error('sensitive database detail') },
    async recordRefresh() { return baseSummary },
  }, {
    info() {},
    error(message) { errors.push(message) },
  })

  const wrongMethod = await fetch(`${url}/api/summary`, { method: 'POST' })
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.get('allow'), 'GET')

  const failed = await fetch(`${url}/api/summary`)
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { error: 'Dashboard data is temporarily unavailable.' })
  assert.equal(errors.length, 1)
  assert.equal(errors[0].includes('sensitive database detail'), false)
})
