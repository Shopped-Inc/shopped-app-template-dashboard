import http from 'node:http'

const port = Number(process.env.PORT || 8080)

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (request.method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true })
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/summary') {
    sendJson(response, 200, {
      openWork: 18,
      completedToday: 42,
      onTimeRate: 0.94,
      updatedAt: new Date().toISOString(),
      activity: [
        { item: 'Morning fulfillment wave', status: 'Complete', owner: 'Operations' },
        { item: 'Inventory exception review', status: 'In progress', owner: 'Merchandising' },
        { item: 'Carrier handoff', status: 'On track', owner: 'Logistics' },
      ],
    })
    return
  }
  sendJson(response, 404, { error: 'Not found' })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`dashboard-api listening on ${port}`)
})

function stop() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
