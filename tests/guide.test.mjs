import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, symlink, lstat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { checkRepoContract, runRepoGuide } from '../.shopped/shopped-repo-guide.mjs'

const quiet = () => {}

test('template seeds discoverable managed guidance and matching versioned bytes', async () => {
  const metadata = JSON.parse(await readFile('.shopped/agent-guide-version.json', 'utf8'))
  assert.equal(metadata.version, 2)
  for (const [path, expected] of Object.entries(metadata.managedFiles)) {
    const content = await readFile(path, 'utf8')
    assert.equal(createHash('sha256').update(content).digest('hex'), expected, path)
    assert.doesNotMatch(content, /ARMPIT|Carpe-Lotion|armpit-creators/)
  }
  for (const path of ['AGENTS.md', 'CLAUDE.md']) {
    const content = await readFile(path, 'utf8')
    assert.match(content, /SHOPPED-HOSTING:BEGIN version=2/)
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

test('distributed updater preserves customer rules/symlinks and reports conflicts without writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'template-guide-preserve-'))
  try {
    await writeFile(join(root, 'CLAUDE.md'), '# Customer rules\n')
    await symlink('CLAUDE.md', join(root, 'AGENTS.md'))
    assert.equal(await runRepoGuide(['init', '--root', root, '--write'], quiet), 0)
    assert.equal((await lstat(join(root, 'AGENTS.md'))).isSymbolicLink(), true)
    const entry = await readFile(join(root, 'CLAUDE.md'), 'utf8')
    assert.match(entry, /^# Customer rules/)
    assert.equal(await runRepoGuide(['check', '--root', root], quiet), 0)
    const metadata = await readFile(join(root, '.shopped/agent-guide-version.json'), 'utf8')
    const edited = (await readFile(join(root, '.shopped/agent-guide.md'), 'utf8')).replace('Git-backed Shopped app', 'Customer edited guide')
    await writeFile(join(root, '.shopped/agent-guide.md'), edited)
    assert.equal(await runRepoGuide(['update', '--root', root, '--write'], quiet), 1)
    assert.equal(await readFile(join(root, '.shopped/agent-guide-version.json'), 'utf8'), metadata)
    assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), entry)
    assert.equal(await readFile(join(root, '.shopped/agent-guide.md'), 'utf8'), edited)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('distributed freshness detects missing/modified entry points and scoped discovery links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'template-guide-scope-'))
  try {
    await writeFile(join(root, 'CLAUDE.md'), '# Root customer rules\n')
    await symlink('CLAUDE.md', join(root, 'AGENTS.md'))
    const scope = ['--root', root, '--subdir', 'apps/test']
    assert.equal(await runRepoGuide(['init', ...scope, '--write'], quiet), 0)
    assert.equal(await runRepoGuide(['check', ...scope], quiet), 0)
    await rm(join(root, 'apps/test/CLAUDE.md'))
    assert.equal(await runRepoGuide(['check', ...scope], quiet), 1)
    assert.equal(await runRepoGuide(['update', ...scope, '--write'], quiet), 0)
    const appEntry = await readFile(join(root, 'apps/test/CLAUDE.md'), 'utf8')
    await writeFile(join(root, 'apps/test/CLAUDE.md'), appEntry.replace('Use platform identity', 'Changed managed rule'))
    assert.equal(await runRepoGuide(['check', ...scope], quiet), 1)
    await writeFile(join(root, 'apps/test/CLAUDE.md'), appEntry)
    const rootEntry = await readFile(join(root, 'CLAUDE.md'), 'utf8')
    await writeFile(join(root, 'CLAUDE.md'), rootEntry.replace('apps/test/AGENTS.md', 'missing.md'))
    assert.equal(await runRepoGuide(['check', ...scope], quiet), 1)
    assert.equal(await runRepoGuide(['update', ...scope, '--write'], quiet), 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('distributed contract checker prints valid-manifest migration warnings without failing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'template-guide-warning-'))
  try {
    await writeFile(join(root, 'index.html'), '<h1>Fixture</h1>')
    await writeFile(join(root, 'app.json'), JSON.stringify({ version: 1, id: 'fixture', title: 'Fixture', ownerSkill: 'fixture', frontend: { kind: 'static', entry: 'index.html' }, surfaces: [{ id: 'main', kind: 'standalone', entry: 'index.html' }], database: { name: 'fixture', migrations: 'sql' } }))
    const output = []
    assert.equal(checkRepoContract(root, 'app.json', line => output.push(line)), 0)
    assert.equal(output.some(line => line.startsWith('warning:') && line.includes('repository_migrations_ignored')), true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
