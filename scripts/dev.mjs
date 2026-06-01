import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronPackageDir = path.join(rootDir, 'node_modules', '.pnpm', 'electron@30.5.1', 'node_modules', 'electron')
const electronPathFile = path.join(electronPackageDir, 'path.txt')
const electronExe = path.join(electronPackageDir, 'dist', 'electron.exe')
const cachedElectronZip = path.join(rootDir, '.cache', 'electron', 'electron-v30.5.1-win32-x64.zip')

const env = {
  ...process.env,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  electron_config_cache: path.join(rootDir, '.cache', 'electron'),
}

await ensureElectronInstalled()

const devResult = spawnSync('vite', {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: true,
})

process.exit(devResult.status ?? 1)

async function ensureElectronInstalled() {
  if (fs.existsSync(electronPathFile) && fs.existsSync(electronExe)) return

  if (fs.existsSync(cachedElectronZip)) {
    fs.rmSync(path.join(electronPackageDir, 'dist'), { recursive: true, force: true })
    fs.mkdirSync(path.join(electronPackageDir, 'dist'), { recursive: true })
    const expandResult = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${cachedElectronZip}' -DestinationPath '${path.join(electronPackageDir, 'dist')}' -Force`,
    ], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    })
    if (expandResult.status !== 0) {
      process.exit(expandResult.status ?? 1)
    }
    fs.writeFileSync(electronPathFile, 'electron.exe')
    return
  }

  const installResult = spawnSync('node install.js', {
    cwd: electronPackageDir,
    env,
    stdio: 'inherit',
    shell: true,
  })

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1)
  }
}
