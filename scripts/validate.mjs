import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(await readFile('app.json', 'utf8'))
const service = JSON.parse(await readFile('services/api/service.json', 'utf8'))

if (manifest.version !== 1 || manifest.frontend?.kind !== 'static') {
  throw new Error('app.json must remain a version 1 static Shopped app manifest')
}
const kinds = new Set(manifest.surfaces?.map(surface => surface.kind))
for (const kind of ['standalone', 'card', 'widget']) {
  if (!kinds.has(kind)) throw new Error(`app.json is missing the ${kind} surface`)
}
if (service.healthPath !== '/healthz') {
  throw new Error('service.json healthPath must remain /healthz')
}
for (const path of ['web/app.js', 'services/api/index.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Template contract is valid')
