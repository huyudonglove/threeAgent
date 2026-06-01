import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: path.join(rootDir, '.cache', 'electron-builder'),
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
}

const steps = [
  'vue-tsc',
  'vite build',
  'electron-builder',
]

for (const command of steps) {
  const result = spawnSync(command, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
