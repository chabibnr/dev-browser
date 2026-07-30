import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ProxyConfig } from '@shared/types'
import { isTabColorId, type TabColorId } from '@shared/colors'
import { isValidDevice, type DevicePreset } from '@shared/devices'

const STATE_VERSION = 2

export interface PersistedTab {
  id: string
  sessionId: string
  url: string
  pageTitle: string
  customTitle: string | null
  color: TabColorId | null
  isInternal: boolean
  proxy: ProxyConfig | null
  userAgent: string | null
}

/**
 * Satu profil window: kumpulan tab yang bisa dibuka, ditutup, lalu dibuka lagi.
 *
 * Sebelumnya window yang ditutup langsung dibuang dari state, sehingga hanya
 * window terakhir yang bisa kembali. Profil membuat tiap window jadi entri
 * permanen yang dikelola dari Window Manager.
 */
export interface PersistedProfile {
  id: string
  name: string
  createdAt: number
  lastOpenedAt: number | null
  activeTabId: string | null
  tabs: PersistedTab[]
}

export interface PersistedState {
  version: number
  profiles: PersistedProfile[]
}

/** v1: daftar window tanpa nama; lebih lama lagi: tab langsung di akar. */
interface StateV1 {
  version?: number
  windows?: { activeTabId: string | null; tabs: PersistedTab[] }[]
  activeTabId?: string | null
  tabs?: PersistedTab[]
}

const stateFile = (): string => path.join(app.getPath('userData'), 'state.json')

export function loadState(): PersistedState | null {
  let raw: string
  try {
    raw = fs.readFileSync(stateFile(), 'utf-8')
  } catch {
    return null // belum pernah dijalankan
  }

  // Buang entri cacat agar satu tab rusak tidak menggagalkan seluruh restore.
  const cleanTabs = (list: unknown): PersistedTab[] =>
    (Array.isArray(list) ? list : [])
      .filter(
        (t): t is PersistedTab =>
          !!t &&
          typeof t.id === 'string' &&
          typeof t.sessionId === 'string' &&
          typeof t.url === 'string'
      )
      // Warna dari versi lama (atau yang sudah dihapus dari palet) diabaikan
      // diam-diam, bukan dibiarkan lolos sebagai id yang tidak dikenal.
      .map((t) => ({ ...t, color: isTabColorId(t.color) ? t.color : null }))

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState> & StateV1

    if (parsed.version === STATE_VERSION && Array.isArray(parsed.profiles)) {
      return {
        version: STATE_VERSION,
        profiles: parsed.profiles
          .filter((p) => p && typeof p.id === 'string')
          .map((p) => ({
            id: p.id,
            name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Window',
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
            lastOpenedAt: typeof p.lastOpenedAt === 'number' ? p.lastOpenedAt : null,
            activeTabId: p.activeTabId ?? null,
            tabs: cleanTabs(p.tabs)
          }))
      }
    }

    // Berkas versi lama DINAIKKAN bentuknya, bukan dibuang — kalau dibuang,
    // semua tab pengguna hilang begitu aplikasi diperbarui.
    if (parsed.version === 1) {
      const groups = Array.isArray(parsed.windows)
        ? parsed.windows
        : [{ activeTabId: parsed.activeTabId ?? null, tabs: parsed.tabs ?? [] }]

      const now = Date.now()
      return {
        version: STATE_VERSION,
        profiles: groups
          .map((group, index) => ({
            id: randomUUID(),
            name: `Window ${index + 1}`,
            createdAt: now,
            lastOpenedAt: now,
            activeTabId: group?.activeTabId ?? null,
            tabs: cleanTabs(group?.tabs)
          }))
          .filter((p) => p.tabs.length > 0)
      }
    }

    return null
  } catch (err) {
    console.error('[persistence] state.json rusak, memulai dari kosong:', err)
    return null
  }
}

// ------------------------------------------------- pengaturan mode responsif

export interface ResponsiveSettings {
  version: number
  customDevices: DevicePreset[]
  selected: string[]
  zoom: number
  sync: boolean
}

const responsiveFile = (): string => path.join(app.getPath('userData'), 'responsive.json')

export function loadResponsive(): ResponsiveSettings | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(responsiveFile(), 'utf-8')) as ResponsiveSettings
    if (parsed.version !== STATE_VERSION) return null
    return {
      version: STATE_VERSION,
      // Device cacat dibuang satu per satu, bukan menggugurkan seluruh berkas.
      customDevices: (parsed.customDevices ?? []).filter(isValidDevice),
      selected: Array.isArray(parsed.selected) ? parsed.selected.filter((s) => typeof s === 'string') : [],
      zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1,
      sync: parsed.sync !== false
    }
  } catch {
    return null
  }
}

export function saveResponsive(settings: ResponsiveSettings): void {
  try {
    fs.writeFileSync(responsiveFile(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[persistence] gagal menyimpan pengaturan responsif:', err)
  }
}

let timer: NodeJS.Timeout | null = null
let pending: PersistedState | null = null

/** Menyimpan state, digabung selama 500ms karena navigasi memicu banyak perubahan. */
export function saveState(state: PersistedState): void {
  pending = state
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    flushState()
  }, 500)
}

/** Menulis simpanan yang tertunda sekarang juga (dipakai saat keluar). */
export function flushState(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const state = pending
  pending = null
  if (!state) return

  const target = stateFile()
  const tmp = `${target}.tmp`
  try {
    // Tulis ke berkas sementara lalu rename, supaya crash saat menulis
    // tidak meninggalkan state.json setengah jadi.
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    fs.renameSync(tmp, target)
  } catch (err) {
    console.error('[persistence] gagal menyimpan state:', err)
  }
}
