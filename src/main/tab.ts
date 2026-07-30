import { app, WebContentsView, type Event, type Input, type Session } from 'electron'
import path from 'node:path'
import type { FindResult, ProxyConfig, TabState } from '@shared/types'
import type { TabColorId } from '@shared/colors'
import { applyProxy, getSession } from './session-store'
import { internalHash, isInternalURL, loadRenderer } from './renderer-url'

export interface TabHooks {
  /** Dipanggil setiap kali ada perubahan yang perlu terlihat di UI. */
  onChange(): void
  /** Halaman meminta membuka tab baru (target=_blank / window.open). */
  onOpenTab(url: string, opts: { inheritSessionFrom: string; background: boolean }): void
  /** Tombol ditekan di dalam halaman — diteruskan ke handler shortcut terpusat. */
  onInput(tabId: string, input: Input, event: Event): void
  /** Hasil pencarian di halaman, untuk indikator "3/17". */
  onFindResult(result: FindResult): void
  /** Halaman melaporkan kredensial yang baru dikirim pengguna. */
  onCredentialReport(tabId: string, message: string, isMainFrame: boolean): void
  /** Dokumen baru siap — saatnya menanam pengawas form dan mencoba mengisi. */
  onDocumentReady(tabId: string): void
}

export interface TabInit {
  id: string
  sessionId: string
  url?: string
  customTitle?: string | null
  color?: TabColorId | null
  pageTitle?: string
  isInternal?: boolean
  proxy?: ProxyConfig | null
  userAgent?: string | null
}

/**
 * Satu tab: metadata + (opsional) WebContentsView.
 *
 * View sengaja dibuat malas. Tab hasil restore hanya berupa metadata sampai
 * pertama kali diaktifkan, supaya membuka aplikasi dengan 15 tab tersimpan
 * tidak langsung menjalankan 15 proses renderer.
 */
export class Tab {
  readonly id: string
  readonly sessionId: string
  readonly isInternal: boolean

  url: string
  pageTitle: string
  customTitle: string | null
  color: TabColorId | null
  favicon: string | null = null
  isLoading = false
  proxy: ProxyConfig | null
  userAgent: string | null

  private view: WebContentsView | null = null
  private destroyed = false
  /** Sudah pernah ada navigasi yang dijalankan pada tab ini. */
  private hasLoaded = false

  constructor(
    init: TabInit,
    private readonly hooks: TabHooks
  ) {
    this.id = init.id
    this.sessionId = init.sessionId
    this.isInternal = init.isInternal ?? false
    this.url = init.url ?? 'about:blank'
    this.pageTitle = init.pageTitle ?? ''
    this.customTitle = init.customTitle ?? null
    this.color = init.color ?? null
    this.proxy = init.proxy ?? null
    this.userAgent = init.userAgent ?? null
  }

  get isLoaded(): boolean {
    return this.hasLoaded
  }

  /** View yang sudah ada, tanpa membuatnya. */
  get currentView(): WebContentsView | null {
    return this.view
  }

  /** Membuat view bila belum ada, lalu memuat URL awal. */
  ensureView(): WebContentsView {
    if (this.view) return this.view

    const ses = getSession(this.sessionId)
    if (this.userAgent) ses.setUserAgent(this.userAgent)
    // Proxy sengaja TIDAK dipasang di sini: setProxy bersifat async, sedangkan
    // ensureView sinkron — permintaan pertama bisa berangkat sebelum proxy aktif.
    // navigate() yang menunggunya sampai benar-benar terpasang.

    this.view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        sandbox: true,
        // Halaman internal adalah bundle kita sendiri, jadi boleh memakai preload.
        // Halaman web biasa TIDAK diberi preload sama sekali: semua sinyal yang
        // dibutuhkan UI sudah tersedia dari event webContents di main process,
        // jadi tidak ada alasan membuka jalur IPC ke situs sembarangan.
        ...(this.isInternal ? { preload: preloadPath() } : {})
      }
    })
    this.view.setBackgroundColor('#ffffff')

    this.wire(this.view, ses)
    return this.view
  }

  /**
   * Memuat halaman kalau tab ini memang belum pernah memuat apa pun.
   *
   * Penandanya `hasLoaded`, BUKAN "apakah view sudah ada". Keduanya sempat
   * disamakan, dan akibatnya fatal: `activate()` membuat view lebih dulu,
   * sehingga pengecekan berbasis view selalu menyimpulkan halaman sudah dimuat
   * dan tab hasil restore tidak pernah termuat sama sekali.
   */
  async ensureLoaded(): Promise<void> {
    if (this.hasLoaded) return
    // Tab kosong tidak perlu dimuat — view yang baru dibuat memang sudah kosong.
    // Kalau tetap dimuat, pemuatan about:blank itu akan berebut dengan URL yang
    // langsung diketik pengguna sesudahnya, dan salah satunya dibatalkan.
    if (this.url === 'about:blank') {
      this.hasLoaded = true
      return
    }
    await this.navigate(this.url)
  }

  private wire(view: WebContentsView, ses: Session): void {
    const wc = view.webContents
    if (this.userAgent) wc.setUserAgent(this.userAgent)

    wc.on('page-title-updated', (_e, title) => {
      // pageTitle tetap diperbarui walau tab sudah di-rename — dipakai untuk tooltip.
      this.pageTitle = title
      this.hooks.onChange()
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      this.favicon = favicons[0] ?? null
      this.hooks.onChange()
    })

    wc.on('did-start-loading', () => {
      this.isLoading = true
      this.hooks.onChange()
    })

    wc.on('did-stop-loading', () => {
      this.isLoading = false
      this.hooks.onChange()
    })

    const syncURL = (url: string): void => {
      // Halaman internal memuat bundle renderer lewat file://, jadi URL asli
      // (browser://…) dipertahankan agar address bar tidak membocorkan path lokal.
      if (!this.isInternal) this.url = url
      this.hooks.onChange()
    }
    wc.on('did-navigate', (_e, url) => syncURL(url))
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) syncURL(url)
    })

    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      // -3 = ABORTED, terjadi normal saat navigasi dibatalkan pengguna.
      if (isMainFrame && code !== -3) console.error(`[tab ${this.id}] gagal memuat ${url}: ${desc}`)
    })

    wc.on('before-input-event', (event, input) => this.hooks.onInput(this.id, input, event))

    // Halaman berbicara ke main lewat pesan console, karena halaman web sengaja
    // TIDAK diberi preload. Lihat src/main/autofill.ts.
    wc.on('console-message', (details) => {
      this.hooks.onCredentialReport(this.id, details.message, details.frame === wc.mainFrame)
    })

    wc.on('dom-ready', () => this.hooks.onDocumentReady(this.id))

    wc.on('found-in-page', (_e, result) => {
      this.hooks.onFindResult({
        tabId: this.id,
        activeMatchOrdinal: result.activeMatchOrdinal ?? 0,
        matches: result.matches ?? 0
      })
    })

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === 'new-window') {
        // Popup asli: window.opener dan window.close() harus tetap bekerja,
        // karena alur login OAuth bergantung pada keduanya.
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { session: ses, contextIsolation: true, sandbox: true }
          }
        }
      }
      // Tab hasil window.open MEWARISI sesi induknya. Kalau diberi sesi baru,
      // setiap alur login pihak ketiga akan gagal.
      this.hooks.onOpenTab(url, {
        inheritSessionFrom: this.sessionId,
        background: disposition === 'background-tab'
      })
      return { action: 'deny' }
    })
  }

  async navigate(url: string): Promise<void> {
    this.url = url
    // Ditandai sebelum await, supaya panggilan yang beruntun tidak memicu
    // dua loadURL sekaligus pada webContents yang sama.
    this.hasLoaded = true
    const wc = this.ensureView().webContents
    // Ditunggu agar tidak ada permintaan yang berangkat mendahului proxy.
    if (this.proxy) await applyProxy(getSession(this.sessionId), this.proxy)
    try {
      if (isInternalURL(url)) await loadRenderer(wc, internalHash(url))
      else await wc.loadURL(url)
    } catch (err) {
      // loadURL menolak saat navigasi dibatalkan atau host tidak ditemukan;
      // did-fail-load sudah mencatat detailnya.
      if (process.env['NODE_ENV'] !== 'production') console.warn(`[tab ${this.id}] navigate:`, err)
    }
  }

  goBack(): void {
    const nav = this.view?.webContents.navigationHistory
    if (nav?.canGoBack()) nav.goBack()
  }

  goForward(): void {
    const nav = this.view?.webContents.navigationHistory
    if (nav?.canGoForward()) nav.goForward()
  }

  reload(): void {
    // Tab hasil restore belum memuat apa pun, jadi webContents.reload() hanya
    // akan memuat ulang halaman kosong dan tombolnya terasa mati. Di keadaan
    // itu reload berarti "muat URL yang tersimpan".
    if (!this.hasLoaded) {
      void this.navigate(this.url)
      return
    }
    this.view?.webContents.reload()
  }

  stop(): void {
    this.view?.webContents.stop()
  }

  find(text: string, options: { forward?: boolean; findNext?: boolean; matchCase?: boolean } = {}): void {
    const wc = this.view?.webContents
    if (!wc) return
    if (text === '') {
      this.stopFind()
      return
    }
    wc.findInPage(text, options)
  }

  stopFind(): void {
    // clearSelection mencegah sorotan terakhir tertinggal di halaman.
    this.view?.webContents.stopFindInPage('clearSelection')
  }

  toggleDevTools(): void {
    const wc = this.view?.webContents
    if (!wc) return
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'right' })
  }

  async setProxy(proxy: ProxyConfig | null): Promise<void> {
    this.proxy = proxy
    await applyProxy(getSession(this.sessionId), proxy)
    this.hooks.onChange()
  }

  setUserAgent(ua: string | null): void {
    this.userAgent = ua
    // Dikembalikan ke UA bawaan, bukan string kosong — setUserAgent('') benar-benar
    // mengirim header User-Agent kosong, dan banyak situs menolaknya.
    const value = ua ?? app.userAgentFallback
    getSession(this.sessionId).setUserAgent(value)
    this.view?.webContents.setUserAgent(value)
    this.hooks.onChange()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    const view = this.view
    this.view = null
    if (!view) return
    // removeAllListeners() sengaja tidak dipakai: Electron memasang listener
    // internalnya sendiri pada webContents, dan menghapusnya bisa merusak
    // pembongkaran view. Listener kita ikut hilang bersama objeknya.
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }

  toState(): TabState {
    const nav = this.view?.webContents.navigationHistory
    return {
      id: this.id,
      sessionId: this.sessionId,
      url: this.url,
      pageTitle: this.pageTitle,
      customTitle: this.customTitle,
      color: this.color,
      favicon: this.favicon,
      isLoading: this.isLoading,
      canGoBack: nav?.canGoBack() ?? false,
      canGoForward: nav?.canGoForward() ?? false,
      isInternal: this.isInternal,
      isLoaded: this.hasLoaded,
      proxy: this.proxy,
      userAgent: this.userAgent
    }
  }
}

function preloadPath(): string {
  // out/main/index.js -> out/preload/index.js
  return path.join(__dirname, '../preload/index.js')
}
