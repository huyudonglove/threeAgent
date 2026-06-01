import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const checks = [
  ['node', ['-v']],
  ['corepack', ['--version']],
  ['corepack', ['pnpm', '-v']],
  ['git', ['--version']],
]

let failed = false

console.log('AgentThee environment doctor')
console.log(`cwd: ${rootDir}`)
console.log('')

for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: true,
  })
  const label = [command, ...args].join(' ')
  if (result.status === 0) {
    console.log(`ok   ${label}: ${result.stdout.trim()}`)
  } else {
    failed = true
    console.log(`fail ${label}: ${(result.stderr || result.stdout).trim()}`)
  }
}

const files = [
  ['Electron executable', 'node_modules/.pnpm/electron@30.5.1/node_modules/electron/dist/electron.exe'],
  ['Electron path.txt', 'node_modules/.pnpm/electron@30.5.1/node_modules/electron/path.txt'],
  ['Electron zip cache', '.cache/electron/electron-v30.5.1-win32-x64.zip'],
]

for (const [label, file] of files) {
  const exists = fs.existsSync(path.join(rootDir, file))
  console.log(`${exists ? 'ok  ' : 'warn'} ${label}: ${file}`)
}

console.log('')
console.log(failed ? 'Doctor found blocking issues.' : 'Doctor checks passed.')
process.exit(failed ? 1 : 0)
