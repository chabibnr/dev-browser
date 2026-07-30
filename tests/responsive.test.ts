import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Menguji window uji responsif terhadap Chromium sungguhan.
 *
 * Yang paling penting di sini: tiap viewport harus melaporkan lebar CSS sesuai
 * DEVICE-nya, bukan lebar kotak fisik tempat ia digambar. Kalau yang terbaca
 * lebar fisik, berarti emulasi device tidak aktif dan seluruh fiturnya sia-sia
 * — media query akan menyala di ambang yang salah.
 */

let server: http.Server
let port: number
let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/set') {
      res.writeHead(200, {
        'Set-Cookie': `who=${url.searchParams.get('v') ?? 'x'}; Path=/; Max-Age=3600`,
        'Content-Type': 'text/html'
      })
      res.end('<body>ok</body>')
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    // Media query dipakai untuk membuktikan ambangnya dievaluasi pada lebar
    // device yang ditiru. Halaman dibuat tinggi agar gulir bisa diuji.
    res.end(
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>
          #bar { background: rgb(26, 115, 232); }
          @media (max-width: 500px) { #bar { background: rgb(192, 57, 43); } }
          @media (min-width: 501px) and (max-width: 900px) { #bar { background: rgb(232, 163, 58); } }
        </style>` +
        `<body style="margin:0"><div id="bar" style="height:5000px">cookies=[${req.headers.cookie ?? ''}]</div></body>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-resp-'))
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

describe('window uji responsif', () => {
  it('memberi tiap viewport lebar CSS device-nya, dan sesi tab asalnya', async () => {
    const result = await app.evaluate(async (_electron, p: number) => {
      const hooks = (
        globalThis as unknown as {
          __browser: { tm: any; openResponsive: any; responsiveWindow: any; getSession: any }
        }
      ).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const base = `http://127.0.0.1:${p}`

      // Cookie disetel lewat tab biasa dulu, supaya bisa dibuktikan bahwa
      // viewport memakai sesi tab itu, bukan sesi baru.
      const tab = hooks.tm.create(`${base}/set?v=akunResp`)
      await tab.navigate(`${base}/set?v=akunResp`)
      await sleep(300)

      hooks.openResponsive(
        `${base}/page`,
        hooks.getSession(tab.sessionId),
        'Akun Uji'
      )

      // Viewport baru dibuat setelah UI window-nya selesai dimuat.
      let win: any = null
      for (let i = 0; i < 200; i++) {
        win = hooks.responsiveWindow()
        if (win && win.viewportContents.size > 0) break
        await sleep(50)
      }
      if (!win) return null

      // Window sengaja dipersempit agar viewport terakhir pasti tergeser keluar
      // layar. Emulasi device harus tetap berlaku untuknya — kalau tidak, media
      // query-nya salah sampai pengguna menggulir ke sana.
      win.window.setContentSize(800, 700)
      await sleep(600)

      const contents = [...win.viewportContents.entries()]
      const readings: {
        id: string
        innerWidth: number
        dpr: number
        body: string
        bar: string
        ua: string
      }[] = []

      for (const [id, wc] of contents) {
        for (let i = 0; i < 100 && wc.isLoading(); i++) await sleep(50)
        await sleep(200)
        const data = await wc.executeJavaScript(
          `({
            w: window.innerWidth,
            d: window.devicePixelRatio,
            b: document.body.innerText,
            bar: getComputedStyle(document.getElementById('bar')).backgroundColor,
            ua: navigator.userAgent
          })`
        )
        readings.push({ id, innerWidth: data.w, dpr: data.d, body: data.b, bar: data.bar, ua: data.ua })
      }

      const state = win.getState()

      // Kisi digulir sampai mentok sehingga viewport pertama benar-benar keluar
      // layar ke atas, lalu lebarnya dibaca ulang. Emulasi harus tetap berlaku.
      win.setScroll(state.maxScrollY)
      await sleep(500)
      const firstId = contents[0][0]
      const offScreenRect = win.getState().rects.find((r: any) => r.deviceId === firstId)
      const offScreenWidth = await contents[0][1].executeJavaScript('window.innerWidth')

      return {
        readings,
        rects: state.rects,
        selected: state.selected,
        maxScrollY: state.maxScrollY,
        offScreen: {
          id: firstId,
          bottomEdge: offScreenRect ? offScreenRect.y + offScreenRect.height : null,
          innerWidth: offScreenWidth
        }
      }
    }, port)

    expect(result).not.toBeNull()
    expect(result!.readings.length).toBeGreaterThanOrEqual(3)

    const byId = new Map(result!.readings.map((r) => [r.id, r]))

    // Lebar CSS mengikuti device, bukan lebar kotak fisiknya.
    expect(byId.get('iphone-15')?.innerWidth).toBe(393)
    expect(byId.get('ipad-mini')?.innerWidth).toBe(768)
    expect(byId.get('laptop')?.innerWidth).toBe(1366)

    // devicePixelRatio ikut ditiru — penting untuk menguji aset @2x/@3x.
    expect(byId.get('iphone-15')?.dpr).toBe(3)

    // Inti yang sebenarnya diuji pengguna: media query menyala di ambang yang
    // tepat pada tiap viewport. Lebar yang benar tanpa ini belum berarti apa-apa.
    expect(byId.get('iphone-15')?.bar).toBe('rgb(192, 57, 43)')
    expect(byId.get('ipad-mini')?.bar).toBe('rgb(232, 163, 58)')
    expect(byId.get('laptop')?.bar).toBe('rgb(26, 115, 232)')

    // Device sentuh mengirim User-Agent ponsel/tablet, karena banyak situs
    // memilih markup berdasarkan UA dan bukan hanya lewat CSS.
    expect(byId.get('iphone-15')?.ua).toContain('iPhone')
    expect(byId.get('ipad-mini')?.ua).toContain('iPad')
    expect(byId.get('laptop')?.ua).not.toContain('iPhone')

    // Kotak fisiknya memang lebih kecil dari viewport yang ditiru; kalau sama,
    // berarti yang berubah cuma ukuran kotak, bukan emulasinya.
    const laptopRect = result!.rects.find(
      (r: { deviceId: string; width: number }) => r.deviceId === 'laptop'
    )
    expect(laptopRect).toBeDefined()
    expect(laptopRect!.width).toBeLessThan(1366)

    // Sesi tab asal terbawa: cookie yang disetel di tab terlihat di viewport.
    for (const reading of result!.readings) {
      expect(reading.body).toContain('who=akunResp')
    }

    // Kisi memang meluap ke bawah, dan emulasi bertahan saat viewport tergulir
    // keluar layar ke atas.
    expect(result!.maxScrollY).toBeGreaterThan(0)
    expect(result!.offScreen.bottomEdge).toBeLessThanOrEqual(88)
    const offScreenDevice = result!.readings.find((r) => r.id === result!.offScreen.id)
    expect(result!.offScreen.innerWidth).toBe(offScreenDevice?.innerWidth)
  })

  it('mengemulasi device yang ditambahkan saat baris sedang tergulir', async () => {
    // Test sebelumnya meninggalkan baris dalam keadaan tergulir mentok, jadi
    // device baru lahir di luar layar. Ini satu-satunya keadaan di mana emulasi
    // benar-benar bisa terlewat: menggulir tidak menghapus emulasi yang sudah
    // terpasang, tetapi viewport yang tidak pernah terlihat tidak pernah dapat.
    const result = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { responsiveWindow: any } }).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const win = hooks.responsiveWindow()
      if (!win) return null

      win.setScroll(win.getState().maxScrollY)
      await sleep(300)
      win.toggleDevice('desktop')

      let wc: any = null
      for (let i = 0; i < 200; i++) {
        wc = win.viewportContents.get('desktop')
        if (wc && !wc.isLoading()) break
        await sleep(50)
      }
      if (!wc) return null
      await sleep(500)

      const rect = win.getState().rects.find((r: any) => r.deviceId === 'desktop')
      const bounds = win.window.getContentBounds()
      return {
        topEdge: rect ? rect.y : null,
        windowHeight: bounds.height,
        innerWidth: await wc.executeJavaScript('window.innerWidth')
      }
    })

    expect(result).not.toBeNull()
    // Benar-benar lahir di luar layar (di bawah tepi bawah window)…
    expect(result!.topEdge).toBeGreaterThanOrEqual(result!.windowHeight)
    // …dan tetap menerima lebar CSS device-nya.
    expect(result!.innerWidth).toBe(1920)
  })

  it('meneruskan gulir dari satu viewport ke viewport lain', async () => {
    const result = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { responsiveWindow: any } }).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const win = hooks.responsiveWindow()
      if (!win) return null
      const contents = [...win.viewportContents.values()]
      if (contents.length < 2) return null

      const [first, ...rest] = contents
      // Digulir ke tengah halaman; sinkronisasi memakai rasio, jadi angka
      // pikselnya tidak akan sama persis antar viewport.
      await first.executeJavaScript('window.scrollTo(0, document.documentElement.scrollHeight * 0.4)')

      let followers: number[] = []
      for (let i = 0; i < 100; i++) {
        await sleep(100)
        followers = await Promise.all(
          rest.map((wc: any) => wc.executeJavaScript('window.scrollY'))
        )
        if (followers.every((y) => y > 0)) break
      }

      return { source: await first.executeJavaScript('window.scrollY'), followers }
    })

    expect(result).not.toBeNull()
    expect(result!.source).toBeGreaterThan(0)
    // Semua viewport lain ikut tergulir, bukan hanya yang disentuh.
    for (const y of result!.followers) expect(y).toBeGreaterThan(0)
  })
})
