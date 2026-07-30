import { randomUUID } from 'node:crypto'
import type { Event, Input } from 'electron'
import { displayTitle, IPC, type AppState, type TabState, type UiCommand } from '@shared/types'
import { toNavigationURL } from '@shared/url'
import type { TabColorId } from '@shared/colors'
import { Tab, type TabHooks } from './tab'
import type { BrowserShell } from './window'
import { INTERNAL_SESSION_ID, releaseSession } from './session-store'

export interface CreateOptions {
  /** Memakai ulang sesi tab lain (dipakai untuk tab hasil window.open). */
  inheritSessionFrom?: string
  background?: boolean
  isInternal?: boolean
  customTitle?: string | null
}

export type InputHandler = (tabId: string, input: Input, event: Event) => void

/**
 * Pemegang seluruh state tab. Renderer tidak menyimpan state apa pun sendiri —
 * setiap perubahan mengirim snapshot penuh ke UI. Jumlah tab kecil, sehingga
 * snapshot penuh jauh lebih murah daripada risiko UI yang tidak sinkron.
 */
export class TabManager {
  private tabs: Tab[] = []
  private activeId: string | null = null
  private notifyTimer: NodeJS.Timeout | null = null

  /** Diisi dari luar (index.ts) supaya TabManager tidak bergantung pada modul shortcut. */
  onInput: InputHandler = () => {}
  /** Dipanggil setelah state berubah, untuk menyimpan ke disk. */
  onPersist: () => void = () => {}
  /** Jumlah unduhan berjalan, disuntik dari luar agar tidak ada ketergantungan melingkar. */
  getDownloadCount: () => number = () => 0
  /** Jumlah kredensial tersimpan untuk origin tab aktif. */
  getCredentialCount: () => number = () => 0
  /** Laporan kredensial dari halaman; diisi dari luar. */
  onCredentialReport: (tabId: string, message: string, isMainFrame: boolean) => void = () => {}
  /** Dokumen baru siap pada sebuah tab. */
  onDocumentReady: (tabId: string) => void = () => {}

  /** Tawaran simpan yang menunggu jawaban. Sandi tidak pernah keluar dari main. */
  savePrompt: { origin: string; username: string; password: string } | null = null

  constructor(private readonly shell: BrowserShell) {}

  // ---------------------------------------------------------------- query

  get all(): readonly Tab[] {
    return this.tabs
  }

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  get activeTabId(): string | null {
    return this.activeId
  }

  find(id: string): Tab | null {
    return this.tabs.find((t) => t.id === id) ?? null
  }

  getState(): AppState {
    return {
      tabs: this.tabs.map((t) => t.toState()),
      activeTabId: this.activeId,
      mode: this.shell.getMode(),
      activeDownloads: this.getDownloadCount(),
      isMaximized: this.shell.isMaximized(),
      savePrompt: this.savePrompt
        ? { origin: this.savePrompt.origin, username: this.savePrompt.username }
        : null,
      credentialCount: this.getCredentialCount()
    }
  }

  /** Label tab yang memakai sesi tertentu — dipakai daftar unduhan. */
  labelForSession(sessionId: string): string {
    const tab = this.tabs.find((t) => t.sessionId === sessionId)
    if (!tab) return 'Tab yang sudah ditutup'
    return displayTitle(tab.toState())
  }

  /** Membuka halaman internal, memakai ulang tab-nya bila sudah terbuka. */
  openInternal(url: string): void {
    const existing = this.tabs.find((t) => t.isInternal && t.url === url)
    if (existing) this.activate(existing.id)
    else this.create(url, { isInternal: true })
  }

  // --------------------------------------------------------------- mutate

  create(url = 'about:blank', opts: CreateOptions = {}): Tab {
    const id = randomUUID()
    const sessionId = opts.isInternal
      ? INTERNAL_SESSION_ID
      : (opts.inheritSessionFrom ?? id)

    const tab = new Tab(
      {
        id,
        sessionId,
        url,
        isInternal: opts.isInternal ?? false,
        customTitle: opts.customTitle ?? null
      },
      this.makeHooks()
    )

    // Tab baru disisipkan tepat setelah tab aktif, seperti perilaku browser umum.
    const at = this.activeId ? this.indexOf(this.activeId) + 1 : this.tabs.length
    this.tabs.splice(at, 0, tab)

    // Tab yang benar-benar baru (termasuk hasil window.open) selalu dimuat;
    // yang tidak dimuat otomatis hanyalah tab hasil restore, lewat restore().
    if (opts.background) {
      tab.ensureView().setVisible(false)
      this.notify()
    } else {
      this.activate(id)
    }
    void tab.ensureLoaded()
    return tab
  }

  /** Membuat tab dari state tersimpan tanpa memuat halamannya. */
  restore(
    state: Pick<
      TabState,
      | 'id'
      | 'sessionId'
      | 'url'
      | 'pageTitle'
      | 'customTitle'
      | 'color'
      | 'isInternal'
      | 'proxy'
      | 'userAgent'
    >
  ): Tab {
    const tab = new Tab(
      {
        id: state.id,
        sessionId: state.sessionId,
        url: state.url,
        pageTitle: state.pageTitle,
        customTitle: state.customTitle,
        color: state.color,
        isInternal: state.isInternal,
        proxy: state.proxy,
        userAgent: state.userAgent
      },
      this.makeHooks()
    )
    this.tabs.push(tab)
    return tab
  }

  private makeHooks(): TabHooks {
    return {
      onChange: () => this.notify(),
      onOpenTab: (childURL, o) =>
        this.create(childURL, {
          inheritSessionFrom: o.inheritSessionFrom,
          background: o.background
        }),
      onInput: (tabId, input, event) => this.onInput(tabId, input, event),
      onFindResult: (result) => {
        const wc = this.shell.chromeView.webContents
        if (!wc.isDestroyed()) wc.send(IPC.FIND_RESULT, result)
      },
      onCredentialReport: (tabId, message, isMainFrame) =>
        this.onCredentialReport(tabId, message, isMainFrame),
      onDocumentReady: (tabId) => this.onDocumentReady(tabId)
    }
  }

  activate(id: string): void {
    const tab = this.find(id)
    if (!tab) return

    this.activeId = id
    // View dibuat, tapi HALAMANNYA tidak dimuat di sini. Tab hasil restore
    // sengaja dibiarkan kosong sampai pengguna memintanya sendiri — lewat
    // tombol muat ulang atau address bar — supaya membuka aplikasi dengan
    // banyak tab tersimpan tidak langsung menembak semua situsnya.
    const view = tab.ensureView()
    this.shell.setActiveView(view)
    this.shell.focusPage()
    this.notify()
  }

  close(id: string): void {
    const index = this.indexOf(id)
    if (index === -1) return

    const tab = this.tabs[index]!
    const view = tab.currentView
    if (view) this.shell.detachView(view)
    tab.destroy()
    this.tabs.splice(index, 1)

    // Sesi hanya dilepas kalau tidak ada tab lain yang masih memakainya
    // (tab hasil window.open berbagi sesi dengan induknya).
    const stillUsed = this.tabs.some((t) => t.sessionId === tab.sessionId)
    if (!stillUsed && tab.sessionId !== INTERNAL_SESSION_ID) {
      void releaseSession(tab.sessionId)
    }

    if (this.activeId === id) {
      this.activeId = null
      const next = this.tabs[index] ?? this.tabs[index - 1] ?? null
      if (next) this.activate(next.id)
    }

    // Window tanpa tab tidak berguna — selalu sediakan satu tab kosong.
    if (this.tabs.length === 0) this.create()
    else this.notify()
  }

  rename(id: string, title: string | null): void {
    const tab = this.find(id)
    if (!tab) return
    const trimmed = title?.trim() ?? ''
    // Nama kosong berarti kembali mengikuti judul halaman.
    tab.customTitle = trimmed === '' ? null : trimmed
    this.notify()
  }

  setColor(id: string, color: TabColorId | null): void {
    const tab = this.find(id)
    if (!tab) return
    tab.color = color
    this.notify()
  }

  reorder(id: string, toIndex: number): void {
    const from = this.indexOf(id)
    if (from === -1) return
    const to = Math.max(0, Math.min(this.tabs.length - 1, toIndex))
    if (from === to) return
    const [tab] = this.tabs.splice(from, 1)
    this.tabs.splice(to, 0, tab!)
    this.notify()
  }

  // ----------------------------------------------------------- navigation

  navigate(id: string, input: string): void {
    const tab = this.find(id)
    if (!tab) return
    void tab.navigate(toNavigationURL(input))
    this.notify()
  }

  /** Berpindah tab relatif terhadap tab aktif (Ctrl+Tab). */
  cycle(delta: number): void {
    if (this.tabs.length < 2) return
    const current = this.activeId ? this.indexOf(this.activeId) : 0
    const next = (current + delta + this.tabs.length) % this.tabs.length
    this.activate(this.tabs[next]!.id)
  }

  activateIndex(index: number): void {
    const tab = index === -1 ? this.tabs.at(-1) : this.tabs[index]
    if (tab) this.activate(tab.id)
  }

  // ------------------------------------------------------------- plumbing

  private indexOf(id: string): number {
    return this.tabs.findIndex((t) => t.id === id)
  }

  /**
   * Mengirim snapshot ke UI. Digabung dalam satu frame karena memuat halaman
   * memicu banyak event beruntun (loading, judul, favicon, navigasi).
   */
  notify(): void {
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      const wc = this.shell.chromeView.webContents
      if (!wc.isDestroyed()) wc.send(IPC.STATE_CHANGED, this.getState())
      this.onPersist()
    }, 16)
  }

  sendCommand(command: UiCommand): void {
    const wc = this.shell.chromeView.webContents
    if (!wc.isDestroyed()) wc.send(IPC.UI_COMMAND, command)
  }

  /**
   * Mengirim ke UI chrome dan ke semua halaman internal.
   * Halaman internal (mis. browser://downloads) memuat bundle renderer yang sama
   * dan perlu ikut menerima pembaruan.
   */
  broadcast(channel: string, payload: unknown): void {
    const targets = [
      this.shell.chromeView.webContents,
      ...this.tabs.filter((t) => t.isInternal).map((t) => t.currentView?.webContents)
    ]
    for (const wc of targets) {
      if (wc && !wc.isDestroyed()) wc.send(channel, payload)
    }
  }

  destroyAll(): void {
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    for (const tab of this.tabs) tab.destroy()
    this.tabs = []
  }
}
