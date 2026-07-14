import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createDashboardServer } from './server.mjs'
import { createPostgresDashboardStore } from './store.mjs'

const port = Number(process.env.PORT || 8080)

export async function startDashboardApi({
  databaseUrl = process.env.DATABASE_URL,
  listenPort = port,
  host = '0.0.0.0',
  logger = console,
} = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the dashboard API.')
  }
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  const store = createPostgresDashboardStore(databaseUrl)
  await store.initialize()
  const server = createDashboardServer({ store, logger })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(listenPort, host, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  logger.info(`dashboard-api listening on ${listenPort}`)

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await new Promise(resolveClose => server.close(resolveClose))
    await store.close()
  }
  process.once('SIGINT', () => void stop().then(() => process.exit(0)))
  process.once('SIGTERM', () => void stop().then(() => process.exit(0)))
  return { server, store, stop }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  startDashboardApi().catch(error => {
    const knownConfigurationError = error instanceof Error
      && (error.message.startsWith('DATABASE_URL is required') || error.message.startsWith('PORT must'))
    const message = knownConfigurationError
      ? error.message
      : 'Database initialization failed.'
    console.error(`dashboard-api failed to start: ${message}`)
    process.exit(1)
  })
}
