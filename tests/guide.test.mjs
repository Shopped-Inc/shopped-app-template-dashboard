import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import test from 'node:test'

test('template seeds discoverable managed guidance and matching versioned bytes', async () => {
  const metadata = JSON.parse(await readFile('.shopped/agent-guide-version.json', 'utf8'))
  assert.equal(metadata.version, 1)
  for (const [path, expected] of Object.entries(metadata.managedFiles)) {
    const content = await readFile(path, 'utf8')
    assert.equal(createHash('sha256').update(content).digest('hex'), expected, path)
    assert.doesNotMatch(content, /ARMPIT|Carpe-Lotion|armpit-creators/)
  }
  for (const path of ['AGENTS.md', 'CLAUDE.md']) {
    const content = await readFile(path, 'utf8')
    assert.match(content, /SHOPPED-HOSTING:BEGIN version=1/)
    assert.match(content, /\.shopped\/agent-guide\.md/)
    assert.equal(content.match(/^- /gm).length, 8)
  }
})

test('offline checker and guide freshness command succeed without credentials', () => {
  for (const args of [['check'], ['contract', '--lint', 'web']]) {
    const result = spawnSync(process.execPath, ['.shopped/shopped-repo-guide.mjs', ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
  }
})

test('optional workflow defaults off and publish does not claim to run repo SQL', async () => {
  const workflow = await readFile('.github/workflows/shopped-contract.yml', 'utf8')
  assert.match(workflow, /if: vars\.SHOPPED_CONTRACT_CHECKS == 'true'/)
  const manifest = JSON.parse(await readFile('app.json', 'utf8'))
  assert.equal('migrations' in manifest.database, false)
  assert.match(await readFile('README.md', 'utf8'), /does \*\*not\*\* execute repository SQL/)
})
