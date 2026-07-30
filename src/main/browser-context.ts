import { BrowserShell } from './window'
import { TabManager } from './tab-manager'
import { handleInput } from './shortcuts'
import { autofillIfUnambiguous, installDetector, readReport } from './autofill'
import { credentialsFor, isVaultAvailable } from './credentials'
import { unregisterWindow } from './window-registry'
import type { PersistedProfile } from './persistence'

/**
 * Satu window browser lengkap: shell (window + layout) beserta TabManager-nya.
 *
 * Dulu keduanya singleton di index.ts. Dipisah menjadi kelas ini supaya bisa ada
 * lebih dari satu window, masing-masing dengan kumpulan tab dan sesinya sendiri.
 * Semua yang perlu tahu "window mana" mencarinya lewat browser-registry.
 */
export class BrowserContext {
  readonly shell: BrowserShell
  readonly tm: TabManager

  constructor(
    readonly profileId: string,
    restore: PersistedProfile | null,
    hooks: {
      onPersist(): void
      onClosed(context: BrowserContext): void
      onNewWindow(): void
    }
  ) {
    this.shell = new BrowserShell()
    this.tm = new TabManager(this.shell)

    this.shell.onWindowStateChange = () => this.tm.notify()
    this.tm.onPersist = () => hooks.onPersist()
    this.tm.onInput = (tabId, input, event) => handleInput(this, tabId, input, event, hooks.onNewWindow)

    // Shortcut juga harus bekerja saat fokus ada di UI chrome, bukan hanya di halaman.
    this.shell.chromeView.webContents.on('before-input-event', (event, input) => {
      handleInput(this, this.tm.activeTabId ?? '', input, event, hooks.onNewWindow)
    })

    this.tm.getCredentialCount = () => {
      const url = this.tm.active?.url
      if (!url || !isVaultAvailable()) return 0
      try {
        return credentialsFor(new URL(url).origin).length
      } catch {
        return 0
      }
    }

    // Dokumen baru: tanam pengawas form, lalu isi bila tidak ambigu.
    this.tm.onDocumentReady = (tabId) => {
      const wc = this.tm.find(tabId)?.currentView?.webContents
      if (!wc) return
      installDetector(wc)
      void autofillIfUnambiguous(wc)
    }

    this.tm.onCredentialReport = (tabId, message, isMainFrame) => {
      const wc = this.tm.find(tabId)?.currentView?.webContents
      if (!wc) return
      void readReport(wc, isMainFrame, message).then((prompt) => {
        // Hanya tab yang sedang aktif boleh memunculkan tawaran, supaya tab
        // latar tidak diam-diam mengubah bilah yang sedang dilihat pengguna.
        if (!prompt || this.tm.activeTabId !== tabId) return
        this.tm.savePrompt = prompt
        this.shell.setMode('strip-save')
        this.tm.notify()
      })
    }

    this.restoreTabs(restore)

    this.shell.window.on('closed', () => {
      unregisterWindow(this.chromeWebContentsId)
      // onClosed dipanggil SEBELUM tab dibongkar: ia perlu memotret daftar tab
      // yang masih utuh untuk disimpan. Dibalik urutannya, yang tersimpan adalah
      // daftar kosong dan semua tab hilang saat aplikasi dibuka lagi.
      hooks.onClosed(this)
      this.tm.destroyAll()
    })
  }

  get chromeWebContentsId(): number {
    return this.shell.chromeView.webContents.id
  }

  focus(): void {
    if (this.shell.window.isMinimized()) this.shell.window.restore()
    this.shell.window.show()
    this.shell.window.focus()
  }

  /** Isi window ini untuk disimpan kembali ke profilnya. */
  snapshot(): { activeTabId: string | null; tabs: PersistedProfile['tabs'] } {
    return {
      activeTabId: this.tm.activeTabId,
      tabs: this.tm.all.map((t) => ({
        id: t.id,
        sessionId: t.sessionId,
        url: t.url,
        pageTitle: t.pageTitle,
        customTitle: t.customTitle,
        color: t.color,
        isInternal: t.isInternal,
        proxy: t.proxy,
        userAgent: t.userAgent
      }))
    }
  }

  private restoreTabs(restore: PersistedProfile | null): void {
    if (!restore || restore.tabs.length === 0) {
      this.tm.create()
      return
    }

    for (const saved of restore.tabs) {
      this.tm.restore({
        ...saved,
        proxy: saved.proxy ?? null,
        userAgent: saved.userAgent ?? null
      })
    }

    // Hanya tab aktif yang dibuatkan view; isinya baru dimuat saat diminta.
    const target =
      restore.activeTabId && this.tm.find(restore.activeTabId)
        ? restore.activeTabId
        : restore.tabs[0]!.id
    this.tm.activate(target)
  }
}
