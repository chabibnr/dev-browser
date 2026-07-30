import { app, BaseWindow, WebContentsView } from 'electron'
import path from 'node:path'
import { FINDBAR_HEIGHT, SAVEBAR_HEIGHT, TOPBAR_HEIGHT, type ChromeMode } from '@shared/types'
import { loadRenderer } from './renderer-url'
import { registerWindow, unregisterWindow } from './window-registry'

/**
 * Window aplikasi: satu `chromeView` berisi UI React, plus view halaman
 * yang ditumpuk di bawahnya.
 *
 * chromeView selalu paling atas. Karena `addChildView` menaruh anak baru di
 * urutan teratas, view halaman selalu disisipkan di indeks 0 agar tidak pernah
 * menutupi UI.
 */
export class BrowserShell {
  readonly window: BaseWindow
  readonly chromeView: WebContentsView

  private mode: ChromeMode = 'strip'
  private activeView: WebContentsView | null = null

  /** Diisi dari luar, dipanggil saat status maximize berubah. */
  onWindowStateChange: () => void = () => {}

  constructor() {
    this.window = new BaseWindow({
      width: 1280,
      height: 820,
      minWidth: 640,
      minHeight: 400,
      title: 'DEV Browser',
      backgroundColor: '#ffffff',
      show: false,
      // Dipakai untuk ikon taskbar saat mode dev. Pada aplikasi terpasang,
      // Windows mengambil ikon dari .exe yang sudah disematkan electron-builder.
      // getAppPath() menunjuk ke root proyek saat dev dan ke app.asar saat
      // terpasang, jadi satu path ini berlaku di keduanya.
      icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
      // Frameless: bilah tab merangkap title bar, seperti Chrome. Tombol
      // minimize/maximize/close digambar sendiri di UI (lihat WindowControls).
      frame: false
    })

    this.chromeView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true
      }
    })
    // Sama dengan --bg di styles.css: warna pita bilah tab, supaya tidak ada
    // kedipan gelap sebelum UI selesai dimuat.
    this.chromeView.setBackgroundColor('#dee1e6')
    this.window.contentView.addChildView(this.chromeView)

    void loadRenderer(this.chromeView.webContents)

    registerWindow(this.chromeView.webContents.id, {
      minimize: () => this.minimize(),
      toggleMaximize: () => this.toggleMaximize(),
      close: () => this.close()
    })
    this.window.on('closed', () => unregisterWindow(this.chromeView.webContents.id))

    this.window.on('resize', () => this.layout())
    // Ikon maximize/restore harus ikut berubah saat window di-snap lewat
    // Windows (drag ke tepi layar / Win+↑), bukan hanya lewat tombol kita.
    this.window.on('maximize', () => this.onWindowStateChange())
    this.window.on('unmaximize', () => this.onWindowStateChange())
    // BaseWindow tidak punya event `ready-to-show` seperti BrowserWindow,
    // jadi window ditampilkan begitu UI chrome selesai dimuat.
    this.chromeView.webContents.once('did-finish-load', () => {
      this.window.show()
      this.layout()
    })

    this.layout()
  }

  /** Tinggi area yang ditempati bilah chrome, yaitu titik awal area halaman. */
  private get topOffset(): number {
    if (this.mode === 'strip-find') return TOPBAR_HEIGHT + FINDBAR_HEIGHT
    if (this.mode === 'strip-save') return TOPBAR_HEIGHT + SAVEBAR_HEIGHT
    return TOPBAR_HEIGHT
  }

  getMode(): ChromeMode {
    return this.mode
  }

  setMode(mode: ChromeMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this.layout()
  }

  /** Menampilkan view sebuah tab dan menyembunyikan yang sebelumnya. */
  setActiveView(view: WebContentsView | null): void {
    if (this.activeView === view) {
      this.layout()
      return
    }

    if (this.activeView) this.activeView.setVisible(false)
    this.activeView = view

    if (view) {
      const children = this.window.contentView.children
      // Disisipkan di paling bawah supaya chromeView tetap di atas.
      if (!children.includes(view)) this.window.contentView.addChildView(view, 0)
      view.setVisible(true)
    }
    this.layout()
  }

  /** Melepas view dari window (dipanggil saat tab ditutup). */
  detachView(view: WebContentsView): void {
    if (this.activeView === view) this.activeView = null
    if (this.window.contentView.children.includes(view)) {
      this.window.contentView.removeChildView(view)
    }
  }

  layout(): void {
    if (this.window.isDestroyed()) return

    const { width, height } = this.window.getContentBounds()
    const top = this.topOffset

    this.chromeView.setBounds({
      x: 0,
      y: 0,
      width,
      // Mode overlay: UI menutupi seluruh window agar menu dan dialog
      // punya ruang untuk meluber ke area halaman.
      height: this.mode === 'overlay' ? height : top
    })

    this.activeView?.setBounds({
      x: 0,
      y: top,
      width,
      height: Math.max(0, height - top)
    })
  }

  isMaximized(): boolean {
    return this.window.isMaximized()
  }

  minimize(): void {
    this.window.minimize()
  }

  toggleMaximize(): void {
    if (this.window.isMaximized()) this.window.unmaximize()
    else this.window.maximize()
  }

  close(): void {
    this.window.close()
  }

  focusChrome(): void {
    this.chromeView.webContents.focus()
  }

  focusPage(): void {
    this.activeView?.webContents.focus()
  }
}
