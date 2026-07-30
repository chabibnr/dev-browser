import { app, session, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ProxyConfig } from '@shared/types'

/**
 * Tiap tab mendapat folder sesinya sendiri lewat `session.fromPath()`.
 * Karena kita yang menentukan path-nya (bukan nama partition yang dipetakan
 * Electron secara internal), folder itu bisa dihapus dengan pasti saat tab ditutup.
 */

const sessionsRoot = (): string => path.join(app.getPath('userData'), 'sessions')
const pendingFile = (): string => path.join(app.getPath('userData'), 'pending-deletes.json')

/** Sesi bersama untuk halaman internal (browser://…). Tidak pernah dihapus. */
export const INTERNAL_SESSION_ID = '_internal'

export function sessionDir(sessionId: string): string {
  return path.join(sessionsRoot(), sessionId)
}

const cache = new Map<string, Session>()

type SessionListener = (ses: Session, sessionId: string) => void
const listeners: SessionListener[] = []

/**
 * Dipanggil untuk setiap sesi, termasuk yang sudah dibuat sebelumnya.
 * Dipakai download manager, yang harus memasang `will-download` pada tiap sesi
 * — tidak ada satu tempat terpusat, karena tiap tab punya sesinya sendiri.
 */
export function onSessionCreated(listener: SessionListener): void {
  listeners.push(listener)
  for (const [id, ses] of cache) listener(ses, id)
}

/** Mengambil (atau membuat) sesi terisolasi untuk sebuah tab. Wajib dipanggil setelah app ready. */
export function getSession(sessionId: string): Session {
  const cached = cache.get(sessionId)
  if (cached) return cached

  const dir = sessionDir(sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const ses = session.fromPath(dir)
  cache.set(sessionId, ses)
  for (const listener of listeners) listener(ses, sessionId)
  return ses
}

/** Semua sesi yang sedang hidup — dipakai untuk membilas cookie sebelum keluar. */
export function liveSessions(): Session[] {
  return [...cache.values()]
}

export function applyProxy(ses: Session, proxy: ProxyConfig | null): Promise<void> {
  const config = proxy
    ? { proxyRules: proxy.rules, proxyBypassRules: proxy.bypass || '<local>' }
    : { mode: 'system' as const }

  return ses.setProxy(config).then(() =>
    // Tanpa ini, koneksi keep-alive yang sudah terbuka tetap memakai proxy lama.
    ses.closeAllConnections()
  )
}

/**
 * Melepas sesi milik tab yang ditutup: kosongkan isinya sekarang, hapus foldernya nanti.
 *
 * Folder sesi masih terkunci oleh Chromium selama aplikasi berjalan (terutama di
 * Windows), jadi penghapusan sesungguhnya diantrekan dan dijalankan saat startup
 * berikutnya — sebelum sesi apa pun dibuat.
 */
export async function releaseSession(sessionId: string): Promise<void> {
  if (sessionId === INTERNAL_SESSION_ID) return

  const ses = cache.get(sessionId)
  if (ses) {
    try {
      await ses.closeAllConnections()
      await ses.clearStorageData()
      await ses.clearCache()
    } catch (err) {
      console.error(`[session] gagal mengosongkan ${sessionId}:`, err)
    }
    cache.delete(sessionId)
  }
  queueDelete(sessionId)
}

function readPending(): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pendingFile(), 'utf-8'))
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writePending(ids: string[]): void {
  try {
    fs.writeFileSync(pendingFile(), JSON.stringify(ids), 'utf-8')
  } catch (err) {
    console.error('[session] gagal menulis pending-deletes.json:', err)
  }
}

function queueDelete(sessionId: string): void {
  const pending = readPending()
  if (!pending.includes(sessionId)) writePending([...pending, sessionId])
}

/**
 * Menghapus folder sesi yang tertunda.
 * HARUS dijalankan sebelum sesi mana pun dibuat, jika tidak foldernya terkunci lagi.
 */
export function purgePendingDeletes(): void {
  const pending = readPending()
  if (pending.length === 0) return

  const failed: string[] = []
  for (const id of pending) {
    const dir = sessionDir(id)
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      console.error(`[session] gagal menghapus ${dir}:`, err)
      failed.push(id)
    }
  }
  writePending(failed)
}

/**
 * Melaporkan folder sesi yang tidak dirujuk tab mana pun — sisa dari tab yang
 * hilang karena crash.
 *
 * Sengaja HANYA melaporkan, tidak menghapus. Versi sebelumnya menghapusnya, dan
 * itu keliru secara prinsip: penghapusan dipicu oleh KESIMPULAN ("tidak ada tab
 * yang merujuknya"), padahal kesimpulan itu ikut salah begitu state.json rusak
 * atau tertinggal — dan yang hilang adalah seluruh login pengguna, tanpa bisa
 * dibatalkan. Menukar beberapa MB sisa di disk dengan risiko seperti itu tidak
 * sepadan. Penghapusan yang benar-benar diminta pengguna (menutup tab) tetap
 * berjalan lewat antrean pending-deletes.
 */
export function reportOrphanSessions(keep: Set<string>): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(sessionsRoot(), { withFileTypes: true })
  } catch {
    return [] // folder belum ada
  }

  const orphans = entries
    .filter((e) => e.isDirectory() && e.name !== INTERNAL_SESSION_ID && !keep.has(e.name))
    .map((e) => e.name)

  if (orphans.length > 0) {
    console.warn(
      `[session] ${orphans.length} folder sesi tidak dirujuk tab mana pun dan DIBIARKAN:`,
      orphans.join(', ')
    )
  }
  return orphans
}
