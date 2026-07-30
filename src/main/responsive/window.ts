import { app, BaseWindow, View, WebContentsView, type Session, type WebContents } from 'electron'
import path from 'node:path'
import { IPC, type ResponsiveState, type ViewportRect } from '@shared/types'
import { BUILT_IN_DEVICES, DEFAULT_SELECTION, type DevicePreset } from '@shared/devices'
import { toNavigationURL } from '@shared/url'
import { loadRenderer } from '../renderer-url'
import { loadResponsive, saveResponsive } from '../persistence'
import { registerWindow, unregisterWindow } from '../window-registry'
import { ViewportSync } from './sync'

const TOPBAR = 88
const PAD = 16
/** Ruang untuk label nama device di atas tiap bingkai. */
const LABEL = 24
const GAP = 20
/** Ruang scrollbar tegak di kanan. */
const SCROLLBAR = 16

/**
 * Window pengujian responsif: kisi viewport yang membungkus ke bawah, masing-masing
 * meniru satu device.
 *
 * Susunannya kebalikan dari window utama — chromeView ditaruh di lapis PALING
 * BAWAH dan menutupi seluruh window, lalu viewport ditumpuk di atasnya. Dengan
 * begitu label dan bingkai tiap device bisa digambar sebagai HTML biasa, dan
 * viewport native menembusnya sebagai kotak-kotak buram.
 *
 * Main memegang seluruh perhitungan tata letak lalu mengirim posisi jadi ke UI,
 * sehingga label dan viewport bergerak dari satu sumber yang sama — kalau UI
 * menghitung sendiri, keduanya akan saling telat saat digulir.
 */
export class ResponsiveWindow {
  readonly window: BaseWindow
  private readonly chromeView: WebContentsView
  /**
   * Wadah tempat semua viewport hidup, dibatasi pada area di bawah bilah atas.
   *
   * Viewport adalah view native yang tidak bisa dipotong oleh CSS. Tanpa wadah
   * ini, viewport yang tergulir ke atas akan menutupi address bar.
   */
  private readonly stage: View
  private readonly viewports = new Map<string, WebContentsView>()
  private readonly appliedScale = new Map<string, number>()
  private readonly sync = new ViewportSync()

  private customDevices: DevicePreset[] = []
  private selected: string[] = []
  private zoom = 1
  private scrollY = 0
  private maxScrollY = 0
  private overlay = false
  private rects: ViewportRect[] = []

  constructor(
    private url: string,
    private readonly session: Session,
    private readonly sessionLabel: string,
    private readonly onClosed: () => void
  ) {
    const saved = loadResponsive()
    this.customDevices = saved?.customDevices ?? []
    this.selected = saved?.selected?.length ? saved.selected : [...DEFAULT_SELECTION]
    this.zoom = saved?.zoom ?? 1
    this.sync.setEnabled(saved?.sync !== false)

    this.window = new BaseWindow({
      width: 1400,
      height: 900,
      minWidth: 720,
      minHeight: 480,
      title: 'Uji Responsif',
      backgroundColor: '#dee1e6',
      frame: false,
      show: false,
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
    void loadRenderer(this.chromeView.webContents, '/responsive')

    // Ditambahkan setelah chromeView agar berada di atasnya.
    this.stage = new View()
    this.window.contentView.addChildView(this.stage)

    registerWindow(this.chromeView.webContents.id, {
      minimize: () => this.window.minimize(),
      toggleMaximize: () =>
        this.window.isMaximized() ? this.window.unmaximize() : this.window.maximize(),
      close: () => this.window.close()
    })

    this.chromeView.webContents.once('did-finish-load', () => {
      this.window.show()
      this.rebuildViewports()
    })

    this.window.on('resize', () => this.layout())
    this.window.on('maximize', () => this.layout())
    this.window.on('unmaximize', () => this.layout())
    this.window.on('closed', () => this.dispose())
  }

  // ------------------------------------------------------------------ state

  get chromeWebContentsId(): number {
    return this.chromeView.webContents.id
  }

  /** webContents tiap viewport, dipakai diagnostik dan test. */
  get viewportContents(): Map<string, WebContents> {
    const out = new Map<string, WebContents>()
    for (const [id, view] of this.viewports) out.set(id, view.webContents)
    return out
  }

  private get allDevices(): DevicePreset[] {
    return [...BUILT_IN_DEVICES, ...this.customDevices]
  }

  private selectedDevices(): DevicePreset[] {
    return this.selected
      .map((id) => this.allDevices.find((d) => d.id === id))
      .filter((d): d is DevicePreset => !!d)
  }

  getState(): ResponsiveState {
    return {
      url: this.url,
      devices: this.allDevices,
      selected: this.selected,
      rects: this.rects,
      scrollY: this.scrollY,
      maxScrollY: this.maxScrollY,
      zoom: this.zoom,
      syncEnabled: this.sync.isEnabled(),
      isMaximized: this.window.isMaximized(),
      sessionLabel: this.sessionLabel
    }
  }

  private notify(): void {
    const wc = this.chromeView.webContents
    if (!wc.isDestroyed()) wc.send(IPC.RESP_STATE_CHANGED, this.getState())
  }

  private persist(): void {
    saveResponsive({
      version: 1,
      customDevices: this.customDevices,
      selected: this.selected,
      zoom: this.zoom,
      sync: this.sync.isEnabled()
    })
  }

  // -------------------------------------------------------------- viewports

  private rebuildViewports(): void {
    const wanted = new Set(this.selected)

    for (const [id, view] of this.viewports) {
      if (wanted.has(id)) continue
      this.sync.remove(id)
      this.stage.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
      this.viewports.delete(id)
      this.appliedScale.delete(id)
    }

    for (const device of this.selectedDevices()) {
      if (this.viewports.has(device.id)) continue
      this.viewports.set(device.id, this.createViewport(device))
    }

    this.layout()
  }

  private createViewport(device: DevicePreset): WebContentsView {
    const view = new WebContentsView({
      // Sesi tab asal dipakai ulang, sehingga seluruh viewport menguji halaman
      // dalam keadaan sudah login sebagai akun tab itu.
      webPreferences: { session: this.session, contextIsolation: true, sandbox: true }
    })
    view.setBackgroundColor('#ffffff')

    const wc = view.webContents
    // UA harus disetel sebelum pemuatan pertama: banyak situs memilih markup
    // berdasarkan UA, bukan hanya lewat media query.
    if (device.userAgent) wc.setUserAgent(device.userAgent)
    // Jendela pop-up dari viewport uji hanya akan membingungkan.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))

    this.stage.addChildView(view)
    void wc.loadURL(this.url).catch(() => {
      // did-fail-load yang mencatat detailnya.
    })
    void this.sync.add(device.id, wc, device.mobile)
    return view
  }

  private applyEmulation(device: DevicePreset, view: WebContentsView, scale: number): void {
    // Dipasang ulang hanya saat skalanya benar-benar berubah — ini perintah CDP,
    // dan memanggilnya pada tiap piksel resize membuat window tersendat.
    if (Math.abs((this.appliedScale.get(device.id) ?? -1) - scale) < 0.001) return
    this.appliedScale.set(device.id, scale)

    try {
      view.webContents.enableDeviceEmulation({
        screenPosition: device.mobile ? 'mobile' : 'desktop',
        screenSize: { width: device.width, height: device.height },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: device.dpr,
        // viewSize adalah viewport yang dilihat halaman (CSS px), sedangkan
        // scale mengecilkannya agar muat di slot fisik. Inilah yang membuat
        // viewport 1920px bisa ditampilkan di kotak selebar 500px.
        viewSize: { width: device.width, height: device.height },
        scale
      })
    } catch (err) {
      console.error(`[responsive] emulasi device gagal untuk ${device.id}:`, err)
    }
  }

  // ----------------------------------------------------------------- layout

  private layout(): void {
    if (this.window.isDestroyed()) return

    const { width: winW, height: winH } = this.window.getContentBounds()
    this.chromeView.setBounds({ x: 0, y: 0, width: winW, height: winH })

    // Stage memotong viewport pada area di bawah bilah atas. Saat dialog terbuka,
    // seluruh stage disembunyikan sekaligus — satu panggilan, bukan per viewport.
    this.stage.setBounds({ x: 0, y: TOPBAR, width: winW, height: Math.max(0, winH - TOPBAR) })
    this.stage.setVisible(!this.overlay)

    const availH = Math.max(160, winH - TOPBAR - PAD * 2 - LABEL)
    // Lebar maksimum satu baris; sisakan ruang untuk scrollbar tegak di kanan.
    const rowLimit = Math.max(200, winW - PAD * 2 - SCROLLBAR)
    const devices = this.selectedDevices()

    const sizes = devices.map((device) => {
      // Skala dasar membuat device tertinggi pas di satu layar; zoom pengguna
      // dikalikan di atasnya.
      const scale = Math.min(1, availH / device.height) * this.zoom
      return {
        device,
        scale,
        width: Math.max(1, Math.round(device.width * scale)),
        height: Math.max(1, Math.round(device.height * scale))
      }
    })

    /*
     * Device disusun kiri ke kanan lalu MEMBUNGKUS ke baris berikutnya begitu
     * tidak muat. Sebelumnya semuanya dipaksa dalam satu baris yang menjulur
     * keluar layar, sementara ruang di bawah menganggur.
     *
     * Posisi dihitung mutlak dulu supaya tinggi totalnya diketahui, baru
     * gulirannya dijepit dan diterapkan — kalau digeser sambil menghitung,
     * batas gulir tidak akan pernah benar.
     */
    const placed: { size: (typeof sizes)[number]; x: number; y: number }[] = []
    let cursorX = PAD
    let rowTop = TOPBAR + PAD + LABEL
    let rowHeight = 0

    for (const size of sizes) {
      // Baris yang masih kosong selalu menerima satu device, walau device itu
      // sendiri lebih lebar dari window — kalau tidak, ia tidak akan muncul.
      if (cursorX > PAD && cursorX - PAD + size.width > rowLimit) {
        cursorX = PAD
        rowTop += rowHeight + LABEL + GAP
        rowHeight = 0
      }
      placed.push({ size, x: cursorX, y: rowTop })
      cursorX += size.width + GAP
      rowHeight = Math.max(rowHeight, size.height)
    }

    const totalHeight = rowTop + rowHeight + PAD
    this.maxScrollY = Math.max(0, totalHeight - winH)
    this.scrollY = Math.min(Math.max(0, this.scrollY), this.maxScrollY)

    const rects: ViewportRect[] = []

    for (const { size, x, y } of placed) {
      const rect: ViewportRect = {
        deviceId: size.device.id,
        name: size.device.name,
        deviceWidth: size.device.width,
        deviceHeight: size.device.height,
        x,
        y: y - this.scrollY,
        width: size.width,
        height: size.height,
        scale: size.scale
      }
      rects.push(rect)

      const view = this.viewports.get(size.device.id)
      if (!view) continue

      // Bounds dan emulasi diterapkan pada SEMUA viewport, termasuk yang berada
      // di luar layar. Kalau hanya yang terlihat yang diurus, device yang
      // ditambahkan ketika baris sedang tergulir tidak akan pernah menerima
      // emulasinya — ia memakai lebar fisik, dan media query-nya salah.
      // Koordinat di dalam stage, bukan window: stage sudah bergeser TOPBAR.
      view.setBounds({
        x: rect.x,
        y: rect.y - TOPBAR,
        width: rect.width,
        height: rect.height
      })
      this.applyEmulation(size.device, view, size.scale)

      const onScreen = rect.y + rect.height > TOPBAR && rect.y < winH
      view.setVisible(onScreen)
    }

    this.rects = rects
    this.notify()
  }

  // ---------------------------------------------------------------- actions

  navigate(input: string): void {
    this.url = toNavigationURL(input)
    for (const view of this.viewports.values()) {
      void view.webContents.loadURL(this.url).catch(() => {})
    }
    this.notify()
  }

  /** Dipakai saat window sudah terbuka lalu pengguna memintanya lagi dari tab lain. */
  setURL(url: string): void {
    this.navigate(url)
  }

  reloadAll(): void {
    for (const view of this.viewports.values()) view.webContents.reload()
  }

  toggleDevice(id: string): void {
    if (!this.allDevices.some((d) => d.id === id)) return
    this.selected = this.selected.includes(id)
      ? this.selected.filter((s) => s !== id)
      : [...this.selected, id]
    this.persist()
    this.rebuildViewports()
  }

  addDevice(device: DevicePreset): void {
    if (this.allDevices.some((d) => d.id === device.id)) return
    this.customDevices = [...this.customDevices, device]
    this.selected = [...this.selected, device.id]
    this.persist()
    this.rebuildViewports()
  }

  removeDevice(id: string): void {
    // Preset bawaan tidak bisa dihapus, hanya dinonaktifkan.
    if (!this.customDevices.some((d) => d.id === id)) return
    this.customDevices = this.customDevices.filter((d) => d.id !== id)
    this.selected = this.selected.filter((s) => s !== id)
    this.persist()
    this.rebuildViewports()
  }

  setScroll(y: number): void {
    this.scrollY = y
    this.layout()
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(2, Math.max(0.25, zoom))
    this.persist()
    this.layout()
  }

  setSync(enabled: boolean): void {
    this.sync.setEnabled(enabled)
    this.persist()
    this.notify()
  }

  setOverlay(overlay: boolean): void {
    this.overlay = overlay
    this.layout()
  }

  focus(): void {
    if (this.window.isMinimized()) this.window.restore()
    this.window.focus()
  }

  private dispose(): void {
    unregisterWindow(this.chromeView.webContents.id)
    this.sync.clear()
    for (const view of this.viewports.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    this.viewports.clear()
    this.onClosed()
  }
}
