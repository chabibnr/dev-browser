import { app, BaseWindow, WebContentsView } from 'electron'
import path from 'node:path'
import { IPC, displayTitle, type ManagerState, type UpdateState } from '@shared/types'
import { loadRenderer } from './renderer-url'
import { registerWindow, unregisterWindow } from './window-registry'
import { allProfiles } from './profiles'
import { contextForProfile } from './browser-registry'

/**
 * Window Manager: window pembuka yang menampilkan daftar profil.
 *
 * Jauh lebih sederhana dari window browser — tidak ada view halaman di dalamnya,
 * hanya satu chromeView yang mengisi seluruh window. Karena itu dialog di sini
 * tidak perlu trik mode overlay: tidak ada view native yang bisa menimpanya.
 */
export class ManagerWindow {
  readonly window: BaseWindow
  private readonly chromeView: WebContentsView

  constructor(private readonly onClosed: () => void) {
    this.window = new BaseWindow({
      width: 720,
      height: 620,
      minWidth: 480,
      minHeight: 380,
      title: 'Window Manager',
      backgroundColor: '#dee1e6',
      frame: false,
      show: false,
      // Tidak muncul di taskbar: window ini dipanggil dari ikon tray.
      skipTaskbar: true,
      icon: path.join(app.getAppPath(), 'assets', 'icon.png')
    })

    this.chromeView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true
      }
    })
    this.chromeView.setBackgroundColor('#dee1e6')
    this.window.contentView.addChildView(this.chromeView)
    void loadRenderer(this.chromeView.webContents, '/manager')

    registerWindow(this.chromeView.webContents.id, {
      minimize: () => this.window.minimize(),
      toggleMaximize: () =>
        this.window.isMaximized() ? this.window.unmaximize() : this.window.maximize(),
      close: () => this.window.close()
    })

    this.chromeView.webContents.once('did-finish-load', () => {
      this.window.show()
      this.layout()
      this.notify()
    })

    // Diminimalkan berarti pindah ke tray, bukan mengecil ke taskbar — taskbar
    // memang tidak punya entri untuk window ini.
    this.window.on('minimize', () => this.window.hide())

    this.window.on('resize', () => this.layout())
    this.window.on('maximize', () => this.notify())
    this.window.on('unmaximize', () => this.notify())
    this.window.on('closed', () => {
      unregisterWindow(this.chromeView.webContents.id)
      this.onClosed()
    })

    this.layout()
  }

  private layout(): void {
    if (this.window.isDestroyed()) return
    const { width, height } = this.window.getContentBounds()
    this.chromeView.setBounds({ x: 0, y: 0, width, height })
  }

  getState(): ManagerState {
    return {
      profiles: allProfiles().map((profile) => {
        const live = contextForProfile(profile.id)
        // Pratinjau diambil dari window yang hidup bila ada, karena tabnya bisa
        // sudah berubah sejak terakhir disimpan ke profil.
        const tabs = live ? live.tm.all.map((t) => displayTitle(t.toState())) : profile.tabs.map(labelOf)
        return {
          id: profile.id,
          name: profile.name,
          tabCount: tabs.length,
          isOpen: live !== null,
          lastOpenedAt: profile.lastOpenedAt,
          preview: tabs.slice(0, 4)
        }
      }),
      isMaximized: this.window.isMaximized()
    }
  }

  /** Meneruskan keadaan pembaruan ke UI. */
  notifyUpdate(state: UpdateState): void {
    const wc = this.chromeView.webContents
    if (!wc.isDestroyed()) wc.send(IPC.UPD_STATE_CHANGED, state)
  }

  notify(): void {
    const wc = this.chromeView.webContents
    if (!wc.isDestroyed()) wc.send(IPC.MGR_STATE_CHANGED, this.getState())
  }

  focus(): void {
    if (this.window.isMinimized()) this.window.restore()
    this.window.show()
    this.window.focus()
  }
}

function labelOf(tab: { customTitle: string | null; pageTitle: string; url: string }): string {
  const custom = tab.customTitle?.trim()
  if (custom) return custom
  const page = tab.pageTitle?.trim()
  if (page) return page
  return tab.url && tab.url !== 'about:blank' ? tab.url : 'Tab baru'
}
