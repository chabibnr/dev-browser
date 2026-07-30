import { randomUUID } from 'node:crypto'
import { shell, type DownloadItem, type Session } from 'electron'
import type { DownloadState, DownloadStatus } from '@shared/types'
import { onSessionCreated } from './session-store'

/**
 * Unduhan dikumpulkan dari SEMUA sesi menjadi satu daftar.
 *
 * Karena tiap tab punya sesinya sendiri, `will-download` harus dipasang pada
 * setiap sesi — tidak ada satu titik terpusat seperti browser biasa. Tiap entri
 * membawa sesi asalnya supaya jelas akun mana yang mengunduh berkas itu.
 */
export class DownloadManager {
  private items: DownloadState[] = []
  private live = new Map<string, DownloadItem>()

  constructor(
    /** Label tab yang memakai sesi tersebut, untuk ditampilkan di daftar. */
    private readonly labelForSession: (sessionId: string) => string,
    private readonly notify: () => void
  ) {
    onSessionCreated((ses, sessionId) => this.attach(ses, sessionId))
  }

  private attach(ses: Session, sessionId: string): void {
    ses.on('will-download', (_event, item) => {
      const id = randomUUID()
      this.live.set(id, item)

      const entry: DownloadState = {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath: '',
        status: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        sessionId,
        originLabel: this.labelForSession(sessionId),
        startedAt: Date.now()
      }
      this.items.unshift(entry)
      this.notify()

      item.on('updated', (_e, state) => {
        entry.status = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
        entry.receivedBytes = item.getReceivedBytes()
        entry.totalBytes = item.getTotalBytes()
        entry.savePath = item.getSavePath()
        this.notify()
      })

      item.once('done', (_e, state) => {
        entry.status = state as DownloadStatus
        entry.receivedBytes = item.getReceivedBytes()
        entry.savePath = item.getSavePath()
        this.live.delete(id)
        this.notify()
      })
    })
  }

  list(): DownloadState[] {
    return this.items
  }

  /** Jumlah unduhan yang masih berjalan — dipakai badge di toolbar. */
  activeCount(): number {
    return this.items.filter((i) => i.status === 'progressing' || i.status === 'paused').length
  }

  cancel(id: string): void {
    this.live.get(id)?.cancel()
  }

  async openFile(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id)
    if (!item || item.status !== 'completed' || !item.savePath) return
    // openPath mengembalikan string error (kosong bila berhasil), bukan throw.
    const error = await shell.openPath(item.savePath)
    if (error) console.error('[downloads] gagal membuka berkas:', error)
  }

  showInFolder(id: string): void {
    const item = this.items.find((i) => i.id === id)
    if (item?.savePath) shell.showItemInFolder(item.savePath)
  }

  /** Membersihkan entri yang sudah selesai; unduhan berjalan dibiarkan. */
  clearFinished(): void {
    this.items = this.items.filter((i) => i.status === 'progressing' || i.status === 'paused')
    this.notify()
  }
}
