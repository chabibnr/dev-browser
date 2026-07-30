import { app } from 'electron'
import { createRequire } from 'node:module'
import type { AppUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/**
 * Pembaruan otomatis lewat GitHub Releases.
 *
 * Kode ini TIDAK menyebut nama repo di mana pun. electron-builder menuliskan
 * konfigurasi `publish` ke `app-update.yml` di dalam paket saat build, dan
 * electron-updater membacanya sendiri — jadi satu-satunya tempat yang perlu
 * diisi adalah blok `publish` di electron-builder.yml.
 */

/**
 * Dimuat lewat require, bukan `import`.
 *
 * electron-updater memasang `autoUpdater` sebagai getter pada exports-nya.
 * Getter tidak terbaca oleh pemindai named-export milik loader ESM, jadi
 * `await import('electron-updater')` menghasilkan `autoUpdater: undefined` —
 * ini sudah terbukti membuat aplikasi terpasang gagal saat start. require()
 * membaca getter itu apa adanya.
 *
 * Dipanggil malas supaya mode dev tidak pernah menyentuh modulnya sama sekali.
 */
const requireCjs = createRequire(__filename)
let cached: AppUpdater | null = null

function getAutoUpdater(): AppUpdater {
  if (!cached) {
    cached = (requireCjs('electron-updater') as typeof import('electron-updater')).autoUpdater
  }
  return cached
}

let state: UpdateState = { status: 'idle', version: null, percent: 0, message: null }
let notify: (state: UpdateState) => void = () => {}
let started = false

function set(next: Partial<UpdateState>): void {
  state = { ...state, ...next }
  notify(state)
}

export function updateState(): UpdateState {
  return state
}

export function initUpdater(onChange: (state: UpdateState) => void): void {
  notify = onChange

  if (!app.isPackaged) {
    // Mode dev tidak punya app-update.yml dan versinya tidak pernah cocok.
    set({ status: 'unsupported', message: 'Pembaruan hanya berjalan pada aplikasi terpasang.' })
    return
  }

  // Sengaja ditangkap: modul yang gagal dimuat tidak boleh menjadi unhandled
  // rejection yang membanjiri konsol — statusnya cukup dilaporkan ke UI.
  wire().catch((error: Error) => set({ status: 'error', message: error.message }))
}

async function wire(): Promise<void> {
  const autoUpdater = getAutoUpdater()

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: null }))

  autoUpdater.on('update-available', (info) =>
    set({ status: 'downloading', version: info.version, percent: 0, message: null })
  )

  autoUpdater.on('update-not-available', () =>
    set({ status: 'latest', version: null, percent: 0, message: null })
  )

  autoUpdater.on('download-progress', (progress) =>
    set({ status: 'downloading', percent: Math.round(progress.percent) })
  )

  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info.version, percent: 100, message: null })
  )

  autoUpdater.on('error', (error) => {
    // Kegagalan pembaruan TIDAK boleh mengganggu pemakaian: cukup dilaporkan.
    // Penyebab paling umum: belum ada rilis, repo privat, atau tidak ada jaringan.
    set({ status: 'error', message: error?.message ?? 'Gagal memeriksa pembaruan.' })
  })

  started = true
  await check()
}

export async function check(): Promise<void> {
  if (!started) return
  try {
    await getAutoUpdater().checkForUpdates()
  } catch (error) {
    set({ status: 'error', message: (error as Error)?.message ?? 'Gagal memeriksa pembaruan.' })
  }
}

/** Memasang pembaruan yang sudah terunduh dengan memulai ulang aplikasi. */
export function installNow(): void {
  if (state.status !== 'ready') return
  // isSilent=false agar installer terlihat; isForceRunAfter=true agar aplikasi
  // kembali hidup setelah pemasangan.
  getAutoUpdater().quitAndInstall(false, true)
}
