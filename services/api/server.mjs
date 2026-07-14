import http from 'node:http'

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

function routeMethodNotAllowed(response, allow) {
  sendJson(response, 405, { error: 'Method not allowed' }, { allow })
}

export function createDashboardServer({ store, logger = console }) {
  if (!store) throw new Error('A dashboard store is required.')

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')
    try {
      if (url.pathname === '/healthz') {
        if (request.method !== 'GET') {
          routeMethodNotAllowed(response, 'GET')
          return
        }
        await store.health()
        sendJson(response, 200, { ok: true, database: 'ready' })
        return
      }

      if (url.pathname === '/api/summary') {
        if (request.method !== 'GET') {
          routeMethodNotAllowed(response, 'GET')
          return
        }
        sendJson(response, 200, await store.getSummary())
        return
      }

      if (url.pathname === '/api/summary/refresh') {
        if (request.method !== 'POST') {
          routeMethodNotAllowed(response, 'POST')
          return
        }
        sendJson(response, 200, await store.recordRefresh())
        return
      }

      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
        ? ` (${error.code})`
        : ''
      logger.error(`dashboard-api request failed${code}`)
      sendJson(response, 503, { error: 'Dashboard data is temporarily unavailable.' })
    }
  })
}
