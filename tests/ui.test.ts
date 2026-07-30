import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Memeriksa rantai lengkap main -> preload -> React.
 *
 * chromeView memakai `sandbox: true` dengan contextBridge, jadi test ini juga
 * membuktikan preload benar-benar terpasang — bukan hanya bahwa main jalan.
 */

let server: http.Server
let port: number
let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<title>Judul Dari Halaman</title><body>halo</body>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-ui-'))
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, BROWSER_USER_DATA: userDataDir, BROWSER_TEST_HOOKS: '1', NODE_ENV: 'test' }
  })

  await app.evaluate(async () => {
    const g = globalThis as unknown as { __browser?: unknown }
    for (let i = 0; i < 200 && !g.__browser; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (!g.__browser) throw new Error('kait test tidak pernah siap')
    // Window Manager-lah yang terbuka saat aplikasi start, jadi window browser
    // dibuka dulu di sini — test lain semuanya bekerja pada satu window browser.
    ;(g.__browser as { ensureWindow(): unknown }).ensureWindow()
    await new Promise((resolve) => setTimeout(resolve, 800))
  })
})

afterAll(async () => {
  await app?.close().catch(() => {})
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // Windows kadang masih mengunci folder sesi sesaat setelah keluar.
  }
})

describe('UI chrome', () => {
  it('memasang contextBridge dan merender satu tab per tab yang ada', async () => {
    const result = await app.evaluate(async () => {
      const { tm, shell } = (globalThis as unknown as { __browser: { tm: any; shell: any } }).__browser
      const wc = shell.chromeView.webContents

      const waitFor = async (expression: string): Promise<unknown> => {
        for (let i = 0; i < 100; i++) {
          const value = await wc.executeJavaScript(expression)
          if (value) return value
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        return null
      }

      const bridge = await waitFor('typeof window.browser === "function" ? null : typeof window.browser')
      await waitFor('document.querySelectorAll(".tab").length')

      tm.create('about:blank')

      // Ditunggu sampai UI menyusul, bukan jeda tetap — jeda tetap membuat test
      // ini lolos sendirian tapi gagal saat mesin sedang sibuk.
      let rendered = 0
      for (let i = 0; i < 100; i++) {
        rendered = await wc.executeJavaScript('document.querySelectorAll(".tab").length')
        if (rendered === tm.all.length) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      return { bridge, rendered, tabCount: tm.all.length }
    })

    expect(result.bridge).toBe('object')
    expect(result.rendered).toBe(result.tabCount)
  })

  it('menjaga tombol primary tetap terbaca saat di-hover', async () => {
    /*
     * Pernah rusak: `.page__action:hover` berbobot lebih tinggi daripada
     * `.page__action--primary`, jadi latarnya tertimpa abu-muda sementara
     * teksnya tetap putih — tulisannya hilang.
     *
     * :hover dipaksa lewat CDP, karena keadaan hover tidak bisa dibaca dari
     * kode dan tidak muncul begitu saja di test.
     */
    const result = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { manager: any } }).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const wc = hooks.manager.window.contentView.children[0].webContents

      const read = (): Promise<{ bg: string; fg: string }> =>
        wc.executeJavaScript(`
          (() => {
            const btn = document.querySelector('.page__action--primary')
            if (!btn) return null
            const s = getComputedStyle(btn)
            return {
              bg: s.backgroundColor,
              fg: s.color,
              hoverToken: getComputedStyle(document.documentElement)
                .getPropertyValue('--hover').trim()
            }
          })()
        `)

      const normal = await read()
      if (!normal) return null

      wc.debugger.attach('1.3')
      const { root } = await wc.debugger.sendCommand('DOM.getDocument')
      const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '.page__action--primary'
      })
      await wc.debugger.sendCommand('CSS.enable')
      await wc.debugger.sendCommand('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: ['hover']
      })
      await sleep(300)
      const hovered = await read()
      wc.debugger.detach()

      return { normal, hovered }
    })

    expect(result).not.toBeNull()
    // Teks tetap putih di kedua keadaan…
    expect(result!.normal.fg).toBe('rgb(255, 255, 255)')
    expect(result!.hovered.fg).toBe('rgb(255, 255, 255)')
    // …dan latarnya TIDAK boleh menjadi abu-muda atau putih, karena teks putih
    // di atasnya akan hilang. Inilah bug yang pernah terjadi.
    expect(result!.hovered.bg).not.toBe('rgb(232, 234, 237)')
    expect(result!.hovered.bg).not.toBe('rgb(255, 255, 255)')
    // Latarnya memang berubah saat hover, bukan sekadar dibiarkan sama.
    expect(result!.hovered.bg).not.toBe(result!.normal.bg)
  })

  it('memberi tombol Hapus warna danger, dan mengisinya penuh saat di-hover', async () => {
    /*
     * Perangkap yang sama dengan tombol primary di atas: `.page__action:hover`
     * berbobot sama dengan `.page__action--danger:hover`, jadi yang menang
     * adalah yang ditulis belakangan. Kalau urutannya terbalik, latar merahnya
     * tertimpa abu-abu dan tombolnya kembali tampak seperti tombol biasa.
     */
    const result = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { manager: any } }).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const wc = hooks.manager.window.contentView.children[0].webContents

      const read = (): Promise<{ bg: string; fg: string; token: string } | null> =>
        wc.executeJavaScript(`
          (() => {
            const btn = document.querySelector('.page__action--danger')
            if (!btn) return null
            const s = getComputedStyle(btn)
            return {
              bg: s.backgroundColor,
              fg: s.color,
              token: getComputedStyle(document.documentElement)
                .getPropertyValue('--danger').trim()
            }
          })()
        `)

      const normal = await read()
      if (!normal) return null

      wc.debugger.attach('1.3')
      const { root } = await wc.debugger.sendCommand('DOM.getDocument')
      const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '.page__action--danger'
      })
      await wc.debugger.sendCommand('CSS.enable')
      await wc.debugger.sendCommand('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: ['hover']
      })
      await sleep(300)
      const hovered = await read()
      wc.debugger.detach()

      return { normal, hovered }
    })

    expect(result).not.toBeNull()

    // Merah token --danger (#c0392b) dipakai apa adanya, bukan warna lain.
    const danger = 'rgb(192, 57, 43)'
    expect(result!.normal!.token).toBe('#c0392b')

    // Keadaan diam: teks merah di atas latar biasa — tidak berebut perhatian
    // dengan tombol biru `Buka` di baris yang sama.
    expect(result!.normal!.fg).toBe(danger)

    // Saat di-hover barulah merahnya penuh, dengan teks putih di atasnya.
    expect(result!.hovered!.bg).toBe(danger)
    expect(result!.hovered!.fg).toBe('rgb(255, 255, 255)')
  })

  it('menemukan ikon aplikasi di path yang dipakai window', async () => {
    // Diperiksa lewat path yang sama persis dengan yang dipakai BaseWindow, jadi
    // salah folder atau ikon yang gagal didekode langsung ketahuan. Lebih kuat
    // daripada sekadar mengecek berkasnya ada: nativeImage ikut mendekodenya.
    const result = await app.evaluate(({ app: electronApp, nativeImage }) => {
      const image = nativeImage.createFromPath(`${electronApp.getAppPath()}/assets/icon.png`)
      return { empty: image.isEmpty(), size: image.getSize() }
    })

    expect(result.empty).toBe(false)
    // electron-builder butuh minimal 256px untuk membuat .ico multi-ukuran.
    expect(result.size.width).toBeGreaterThanOrEqual(256)
    expect(result.size.width).toBe(result.size.height)
  })

  it('menyediakan kontrol window sendiri karena window frameless', async () => {
    const result = await app.evaluate(async () => {
      const { tm, shell } = (globalThis as unknown as { __browser: { tm: any; shell: any } }).__browser
      const wc = shell.chromeView.webContents
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const buttons: number = await wc.executeJavaScript('document.querySelectorAll(".wc__btn").length')

      // Klik tombol maximize sungguhan lewat DOM, bukan memanggil API langsung —
      // ini sekaligus membuktikan jalur renderer -> preload -> main utuh.
      const before = shell.isMaximized()
      await wc.executeJavaScript('document.querySelectorAll(".wc__btn")[1].click()')
      let after = before
      for (let i = 0; i < 100; i++) {
        after = shell.isMaximized()
        if (after !== before) break
        await sleep(50)
      }

      // Status dikembalikan ke UI supaya ikon maximize/restore ikut berganti.
      let reported: boolean | null = null
      for (let i = 0; i < 100; i++) {
        reported = tm.getState().isMaximized
        if (reported === after) break
        await sleep(50)
      }

      shell.toggleMaximize() // kembalikan seperti semula
      return { buttons, before, after, reported }
    })

    // minimize, maximize, close
    expect(result.buttons).toBe(3)
    expect(result.after).toBe(!result.before)
    expect(result.reported).toBe(result.after)
  })

  it('menandai bilah tab sebagai area seret, tapi tidak elemen yang bisa diklik', async () => {
    const result = await app.evaluate(async () => {
      const { shell } = (globalThis as unknown as { __browser: { shell: any } }).__browser
      return shell.chromeView.webContents.executeJavaScript(`
        (() => {
          const read = (sel) => {
            const el = document.querySelector(sel)
            if (!el) return 'MISSING'
            const style = getComputedStyle(el)
            return style.getPropertyValue('-webkit-app-region').trim() ||
                   style.getPropertyValue('app-region').trim()
          }
          return { strip: read('.strip'), tab: read('.tab'), winBtn: read('.wc__btn') }
        })()
      `)
    })

    // Kalau properti ini tidak terbaca sama sekali, dragging pasti tidak jalan.
    expect(result.strip).toBe('drag')
    expect(result.tab).toBe('no-drag')
    expect(result.winBtn).toBe('no-drag')
  })

  it('mewarnai tab lewat UI, dan toolbar ikut warnanya', async () => {
    /*
     * Menu konteksnya kini Menu native yang digambar sistem, sehingga tidak bisa
     * diklik dari DOM. Yang diuji di sini adalah jalur yang dipicu item menu itu:
     * renderer -> preload -> IPC -> TabManager -> kembali ke tampilan.
     */
    const result = await app.evaluate(async () => {
      const { tm, shell } = (globalThis as unknown as { __browser: { tm: any; shell: any } }).__browser
      const wc = shell.chromeView.webContents
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const waitFor = async (expr: string): Promise<any> => {
        for (let i = 0; i < 100; i++) {
          const value = await wc.executeJavaScript(expr)
          if (value) return value
          await sleep(50)
        }
        return null
      }

      const tab = tm.create('about:blank')
      tm.activate(tab.id)

      // Disasar lewat id: test sebelumnya sudah meninggalkan beberapa tab.
      const selector = `[data-tab-id="${tab.id}"]`
      await waitFor(`!!document.querySelector('${selector}')`)

      await wc.executeJavaScript(`window.browser.setTabColor(${JSON.stringify(tab.id)}, 'blue')`)

      let color: string | null = null
      for (let i = 0; i < 100; i++) {
        color = tm.find(tab.id)?.color ?? null
        if (color) break
        await sleep(50)
      }

      const toolbarColored = await waitFor('!!document.querySelector(".toolbar--colored")')
      const tabColored = await waitFor(`!!document.querySelector('${selector}.tab--colored')`)
      // Toolbar harus memakai warna yang persis sama dengan tab, bukan sekadar berwarna.
      const sameVar = await wc.executeJavaScript(`
        (() => {
          const t = document.querySelector('${selector}').style.getPropertyValue('--tab-color')
          const b = document.querySelector('.toolbar--colored').style.getPropertyValue('--tab-color')
          return t !== '' && t === b
        })()
      `)

      // Ikon toolbar harus SEWARNA dengan garis tepi address bar, dan bukan lagi
      // abu bawaan.
      const ink = await wc.executeJavaScript(`
        (() => {
          const btn = document.querySelector('.toolbar--colored .toolbar__btn:not(:disabled)')
          const field = document.querySelector('.toolbar--colored .toolbar__address')
          // Halaman about:blank tidak punya favicon, jadi kotak penggantinya
          // harus memakai warna tab yang dipilih.
          const blank = document.querySelector('${selector} .tab__favicon--empty')
          return {
            icon: getComputedStyle(btn).color,
            border: getComputedStyle(field).borderTopColor,
            neutral: getComputedStyle(document.documentElement)
              .getPropertyValue('--text-dim').trim(),
            blankFavicon: blank ? getComputedStyle(blank).backgroundColor : null
          }
        })()
      `)

      return { color, toolbarColored, tabColored, sameVar, ink }
    })

    expect(result.color).toBe('blue')
    expect(result.tabColored).toBe(true)
    expect(result.toolbarColored).toBe(true)
    expect(result.sameVar).toBe(true)

    // Ikon memakai warna turunan tab yang sama persis dengan garis address bar…
    expect(result.ink.icon).toBe(result.ink.border)
    // …dan bukan abu bawaan toolbar.
    expect(result.ink.icon).not.toBe(result.ink.neutral)
    // color-mix() dihitung menjadi bentuk color(srgb …), bukan rgb().
    expect(result.ink.icon).toMatch(/^(rgb|color\()/)

    // Tanpa favicon, kotak penggantinya memakai warna palet apa adanya —
    // #5b9dff untuk "blue", bukan abu bawaan.
    expect(result.ink.blankFavicon).toBe('rgb(91, 157, 255)')
  })

  it('mempertahankan nama custom meski judul halaman berubah', async () => {
    const result = await app.evaluate(async (_electron, p: number) => {
      const { tm, shell } = (globalThis as unknown as { __browser: { tm: any; shell: any } }).__browser
      const wc = shell.chromeView.webContents

      const sleep = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms))
      const readLabels = (): Promise<string[]> =>
        wc.executeJavaScript(
          'Array.from(document.querySelectorAll(".tab__title")).map((e) => e.textContent)'
        )

      const tab = tm.create('about:blank')
      tm.rename(tab.id, 'Akun A')

      // Muat halaman yang punya <title> sendiri SETELAH di-rename.
      await tab.navigate(`http://127.0.0.1:${p}/`)
      const pageWc = tab.currentView.webContents
      if (pageWc.isLoading()) {
        await new Promise<void>((resolve) => pageWc.once('did-stop-loading', () => resolve()))
      }
      // Judul halaman harus benar-benar sampai ke main, kalau tidak test ini
      // lolos hanya karena judulnya belum sempat tiba.
      for (let i = 0; i < 100 && tab.pageTitle === ''; i++) await sleep(50)

      // Ditunggu sampai UI menyusul; sepanjang penungguan, judul halaman tidak
      // boleh sekali pun muncul menggantikan nama pilihan pengguna.
      let labels: string[] = []
      let leaked = false
      for (let i = 0; i < 100; i++) {
        labels = await readLabels()
        if (labels.includes('Judul Dari Halaman')) leaked = true
        if (labels.includes('Akun A')) break
        await sleep(50)
      }

      // Rename dikosongkan -> harus kembali mengikuti judul halaman.
      tm.rename(tab.id, '')
      let labelsAfterClear: string[] = []
      for (let i = 0; i < 100; i++) {
        labelsAfterClear = await readLabels()
        if (labelsAfterClear.includes('Judul Dari Halaman')) break
        await sleep(50)
      }

      return { pageTitle: tab.pageTitle, customTitle: tab.customTitle, labels, labelsAfterClear, leaked }
    }, port)

    // Halaman memang mengirim judulnya sendiri...
    expect(result.pageTitle).toBe('Judul Dari Halaman')
    // ...tapi yang tampil tetap nama pilihan pengguna.
    expect(result.labels).toContain('Akun A')
    // Tidak pernah, bahkan sekejap pun, tertimpa judul halaman.
    expect(result.leaked).toBe(false)

    // Setelah nama dikosongkan, judul halaman kembali dipakai.
    expect(result.customTitle).toBeNull()
    expect(result.labelsAfterClear).toContain('Judul Dari Halaman')
  })
})
