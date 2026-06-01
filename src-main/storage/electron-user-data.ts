import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

type ElectronAppLike = {
  getPath(name: 'userData'): string
}

let cachedUserDataPath: string | null = null
const requireFromHere = createRequire(import.meta.url)

export function getUserDataPath(): string {
  if (cachedUserDataPath) return cachedUserDataPath

  const electronApp = getElectronApp()
  if (electronApp) {
    cachedUserDataPath = electronApp.getPath('userData')
    return cachedUserDataPath
  }

  cachedUserDataPath = path.join(os.tmpdir(), 'agentthee-user-data')
  return cachedUserDataPath
}

function getElectronApp(): ElectronAppLike | null {
  try {
    const electron = requireFromHere('electron') as { app?: ElectronAppLike }
    return electron.app ?? null
  } catch {
    return null
  }
}
