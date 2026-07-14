import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(await readFile('app.json', 'utf8'))
const service = JSON.parse(await readFile('services/api/service.json', 'utf8'))
const servicePackage = JSON.parse(await readFile('services/api/package.json', 'utf8'))
const serviceLock = JSON.parse(await readFile('services/api/package-lock.json', 'utf8'))

function countSqlStatements(sql) {
  let count = 0
  let hasContent = false
  let state = 'code'
  let dollarTag = ''
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]
    if (state === 'line-comment') {
      if (character === '\n') state = 'code'
      continue
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'code'
        index += 1
      }
      continue
    }
    if (state === 'single-quote' || state === 'double-quote') {
      const quote = state === 'single-quote' ? "'" : '"'
      if (character === quote && next === quote) {
        index += 1
      } else if (character === quote) {
        state = 'code'
      }
      continue
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        state = 'code'
      }
      continue
    }
    if (character === '-' && next === '-') {
      state = 'line-comment'
      index += 1
      continue
    }
    if (character === '/' && next === '*') {
      state = 'block-comment'
      index += 1
      continue
    }
    if (character === "'") {
      hasContent = true
      state = 'single-quote'
      continue
    }
    if (character === '"') {
      hasContent = true
      state = 'double-quote'
      continue
    }
    if (character === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (match) {
        hasContent = true
        dollarTag = match[0]
        state = 'dollar-quote'
        index += dollarTag.length - 1
        continue
      }
    }
    if (character === ';') {
      if (hasContent) count += 1
      hasContent = false
      continue
    }
    if (!/\s/.test(character)) hasContent = true
  }
  return count + (hasContent ? 1 : 0)
}

if (manifest.version !== 1 || manifest.frontend?.kind !== 'static') {
  throw new Error('app.json must remain a version 1 static Shopped app manifest')
}
const kinds = new Set(manifest.surfaces?.map(surface => surface.kind))
for (const kind of ['standalone', 'card', 'widget']) {
  if (!kinds.has(kind)) throw new Error(`app.json is missing the ${kind} surface`)
}
if (manifest.database?.name !== 'dashboard-data') {
  throw new Error('app.json must declare the dashboard-data managed database')
}
if (manifest.database.migrations !== 'database/migrations') {
  throw new Error('app.json database.migrations must point to database/migrations')
}
if (manifest.services?.api?.path !== 'services/api') {
  throw new Error('app.json must bind the api service from services/api')
}
if (manifest.dataSources?.api?.type !== 'service' || manifest.dataSources.api.service !== 'api') {
  throw new Error('app.json must expose the api service data source')
}

if (service.healthPath !== '/healthz') {
  throw new Error('service.json healthPath must remain /healthz')
}
if (service.start !== 'node index.mjs') {
  throw new Error('service.json must start the checked-in Node entry point')
}
if (service.build !== 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund') {
  throw new Error('service.json must use the locked, lifecycle-script-free npm build')
}
const postgresVersion = servicePackage.dependencies?.postgres
if (!/^\d+\.\d+\.\d+$/.test(postgresVersion || '')) {
  throw new Error('services/api must pin postgres to an exact version')
}
const lockedPostgres = serviceLock.packages?.['node_modules/postgres']
if (lockedPostgres?.version !== postgresVersion || !lockedPostgres.integrity) {
  throw new Error('services/api/package-lock.json must lock the exact postgres dependency with integrity')
}
const serviceEntry = await readFile('services/api/index.mjs', 'utf8')
const storeSource = await readFile('services/api/store.mjs', 'utf8')
if (!serviceEntry.includes('process.env.DATABASE_URL')) {
  throw new Error('The API must consume Shopped\'s launch-only DATABASE_URL binding')
}
for (const operation of ['INSERT INTO dashboard_state', 'SELECT open_work', 'UPDATE dashboard_state']) {
  if (!storeSource.includes(operation)) {
    throw new Error(`The managed Postgres store is missing its ${operation.split(' ')[0]} path`)
  }
}

const migrations = (await readdir('database/migrations'))
  .filter(name => name.endsWith('.sql'))
  .sort()
if (migrations.length === 0) throw new Error('At least one immutable SQL migration is required')
for (const name of migrations) {
  if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(name)) {
    throw new Error(`Migration ${name} must use a sortable immutable filename`)
  }
  const sql = await readFile(`database/migrations/${name}`, 'utf8')
  if (countSqlStatements(sql) !== 1) {
    throw new Error(`Migration ${name} must contain exactly one SQL statement`)
  }
}

for (const path of ['web/index.html', 'web/card.html', 'web/widget.html']) {
  const html = await readFile(path, 'utf8')
  if (!html.includes('"react": "/a/_runtime/v4/react.js"')) {
    throw new Error(`${path} must map React for the platform app runtime`)
  }
  if (!html.includes('"react-dom/client": "/a/_runtime/v4/react-dom-client.js"')) {
    throw new Error(`${path} must map ReactDOM for progressive component-kit enhancement`)
  }
  if (!html.includes('"@shopped/app-runtime": "/a/_runtime/v4/@shopped/app-runtime.js"')) {
    throw new Error(`${path} must map the platform app runtime`)
  }
  if (!html.includes('name="color-scheme" content="light dark"')) {
    throw new Error(`${path} must advertise light and dark color schemes`)
  }
  if (!html.includes('id="app-root"') || !html.includes('data-field="openWork">18<')) {
    throw new Error(`${path} must retain meaningful static-first fallback content`)
  }
}
const css = await readFile('web/app.css', 'utf8')
if (!css.includes(":root[data-theme='dark']") || !css.includes('prefers-color-scheme: dark')) {
  throw new Error('web/app.css must support shell-driven and standalone dark themes')
}
const browserSource = await readFile('web/app.js', 'utf8')
for (const primitive of ['Badge', 'Button', 'Card', 'DataTable', 'Grid', 'MetricCard', 'Page']) {
  if (!browserSource.includes(`    ${primitive},`)) {
    throw new Error(`web/app.js must use the platform ${primitive} component-kit primitive`)
  }
}
if (!browserSource.includes("import('react-dom/client')") || !browserSource.includes('createRoot(rootElement)')) {
  throw new Error('web/app.js must progressively render the real component kit with ReactDOM')
}

for (const path of [
  'web/app.js',
  'services/api/index.mjs',
  'services/api/server.mjs',
  'services/api/store.mjs',
  'tests/service.test.mjs',
  'tests/web.test.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Template contract is valid')
