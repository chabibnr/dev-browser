import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Memastikan tab, nama custom, dan cookie benar-benar bertahan setelah
 * aplikasi ditutup dan dibuka lagi — dijalankan sebagai dua sesi aplikasi nyata.
 */

let server: http.Server
let port: number
let userDataDir: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/set') {
      res.writeHead(200, {
        'Set-Cookie': `who=${url.searchParams.get('v') ?? 'none'}; Path=/; Max-Age=3600`,
        'Content-Type': 'text/html'
      })
      res.end('<title>Halaman Set</title><body>ok</body>')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<title>Halaman Baca</title><body>cookies=[${req.headers.cookie ?? ''}]</body>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-persist-'))
})

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // Windows kadang masih mengunci folder sesi sesaat setelah keluar.
  }
})

function launchWith(dir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, BROWSER_USER_DATA: dir, BROWSER_TEST_HOOKS: '1', NODE_ENV: 'test' },
    // Peluncuran yang macet (mis. lock instance belum lepas) harus gagal dengan
    // pesan jelas, bukan menggantung sampai timeout test yang tanpa petunjuk.
    timeout: 20_000
  })
}

function launch(): Promise<ElectronApplication> {
  return launchWith(userDataDir)
}

/**
 * Menutup aplikasi DAN menunggu prosesnya benar-benar mati.
 *
 * `close()` saja tidak cukup: peluncuran berikutnya memakai folder data yang
 * sama, dan selama lock instance belum dilepas OS, instance baru langsung keluar
 * — Playwright lalu menunggu window yang tidak akan pernah muncul sampai timeout.
 */
async function closeApp(instance: ElectronApplication): Promise<void> {
  const proc = instance.process()
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  await instance.close().catch(() => {})
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))])
  // Lock baru dilepas sesaat setelah proses hilang dari tabel proses.
  await new Promise((resolve) => setTimeout(resolve, 800))
}

async function waitForHooks(app: ElectronApplication): Promise<void> {
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
}

describe('persistensi dan restore', () => {
  it('mengembalikan tab, nama custom, dan login setelah aplikasi dibuka ulang', async () => {
    // --- sesi aplikasi pertama ---------------------------------------------
    const first = await launch()
    await waitForHooks(first)

    const created = await first.evaluate(async (_electron, p: number) => {
      const { tm } = (globalThis as unknown as { __browser: { tm: any } }).__browser
      const base = `http://127.0.0.1:${p}`

      const tab = tm.create(`${base}/set?v=akunA`)
      await tab.navigate(`${base}/set?v=akunA`)
      const wc = tab.currentView.webContents
      if (wc.isLoading()) {
        await new Promise<void>((resolve) => wc.once('did-stop-loading', () => resolve()))
      }

      tm.rename(tab.id, 'Akun A')
      return { id: tab.id, sessionId: tab.sessionId, pageTitle: tab.pageTitle }
    }, port)

    // Judul halaman terbaca, jadi rename memang menimpanya, bukan mengisi kekosongan.
    expect(created.pageTitle).toBe('Halaman Set')

    await closeApp(first)

    // --- sesi aplikasi kedua -----------------------------------------------
    const second = await launch()
    await waitForHooks(second)

    const restored = await second.evaluate(async (_electron, args: { id: string; p: number }) => {
      const { tm } = (globalThis as unknown as { __browser: { tm: any } }).__browser

      // Tiap penantian dibatasi dan diberi label. Tanpa ini, satu langkah yang
      // macet hanya muncul sebagai "test timed out" tanpa petunjuk letaknya.
      const within = <T,>(work: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          work,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`macet di: ${label}`)), ms)
          )
        ])

      const tab = tm.find(args.id)
      if (!tab) return null

      // Sebelum diaktifkan, tab hasil restore hanya metadata — belum ada view.
      const loadedBeforeActivate = tab.isLoaded

      tm.activate(tab.id)
      await within(tab.navigate(`http://127.0.0.1:${args.p}/read`), 20_000, 'navigate /read')
      const wc = tab.currentView.webContents
      if (wc.isLoading()) {
        await within(
          new Promise<void>((resolve) => wc.once('did-stop-loading', () => resolve())),
          20_000,
          'menunggu did-stop-loading'
        )
      }

      return {
        customTitle: tab.customTitle,
        sessionId: tab.sessionId,
        loadedBeforeActivate,
        body: await wc.executeJavaScript('document.body.innerText')
      }
    }, { id: created.id, p: port })

    await closeApp(second)

    expect(restored).not.toBeNull()
    // Nama yang diberikan pengguna bertahan.
    expect(restored!.customTitle).toBe('Akun A')
    // Sesi yang sama dipakai lagi, bukan sesi baru.
    expect(restored!.sessionId).toBe(created.sessionId)
    // Cookie masih ada -> pengguna tetap "login".
    expect(restored!.body).toContain('who=akunA')
  })

  it('tidak kehilangan tab saat window ditutup pengguna', async () => {
    /*
     * Jalur ini BERBEDA dari test lain yang memakai app.close() milik Playwright.
     * Saat pengguna menutup window: event `closed` menyimpan state, tab dibongkar,
     * lalu `before-quit` menyimpan sekali lagi — kali itu daftar tabnya sudah
     * kosong dan menimpa state yang bagus. Akibatnya seluruh tab hilang.
     * app.close() memicu urutan sebaliknya, sehingga bug ini tidak terlihat di sana.
     */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-close-'))
    const first = await launchWith(dir)
    await waitForHooks(first)

    const created = await first.evaluate(async (_electron, p: number) => {
      const { tm } = (globalThis as unknown as { __browser: { tm: any } }).__browser
      const tab = tm.create(`http://127.0.0.1:${p}/read`)
      tm.rename(tab.id, 'Tab Bertahan')
      await new Promise((r) => setTimeout(r, 400))
      return { id: tab.id, total: tm.all.length }
    }, port)

    // Ditutup lewat window-nya, persis seperti pengguna menekan tombol silang.
    await first
      .evaluate(() => {
        const { shell } = (globalThis as unknown as { __browser: { shell: any } }).__browser
        shell.window.close()
      })
      .catch(() => {
        // Proses bisa mati di tengah panggilan ini; itu memang tujuannya.
      })
    await closeApp(first)

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf-8'))
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // Windows kadang masih mengunci folder sesi sesaat setelah keluar.
    }

    // State sekarang berbentuk daftar profil; menutup window tidak menghapus
    // profilnya, jadi tabnya tetap tersimpan di sana.
    expect(saved.version).toBe(2)
    expect(saved.profiles.length).toBeGreaterThanOrEqual(1)
    const win = saved.profiles.find((p: { tabs: { id: string }[] }) =>
      p.tabs.some((t) => t.id === created.id)
    )
    expect(win).toBeDefined()
    expect(win.tabs.length).toBe(created.total)
    expect(win.tabs.some((t: { id: string }) => t.id === created.id)).toBe(true)
    // Tab aktif harus benar-benar ada di dalam daftar itu.
    expect(win.tabs.some((t: { id: string }) => t.id === win.activeTabId)).toBe(true)
  })

  it('tidak memuat isi tab hasil restore, dan tombol muat ulang yang memuatnya', async () => {
    const app = await launch()
    await waitForHooks(app)

    const result = await app.evaluate(async () => {
      const { tm, shell } = (globalThis as unknown as { __browser: { tm: any; shell: any } })
        .__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      // Harus tab yang memang punya URL sungguhan. Tab kosong bawaan juga
      // ber-isLoaded false, dan memilihnya akan membuat test ini lulus/gagal
      // karena alasan yang salah.
      const target = tm.all.find(
        (t: any) => !t.isLoaded && !t.isInternal && t.url.startsWith('http')
      )
      if (!target) return null

      // Mengaktifkan tab membuat view-nya, tapi TIDAK memuat halamannya.
      tm.activate(target.id)

      // Ditunggu sampai UI benar-benar menganggap tab ini yang aktif, karena
      // tombol muat ulang bekerja pada tab aktif menurut versi state di renderer.
      for (let i = 0; i < 100; i++) {
        const ready = await shell.chromeView.webContents.executeJavaScript(
          `!!document.querySelector('[data-tab-id="${target.id}"].tab--active')`
        )
        if (ready) break
        await sleep(50)
      }

      const afterActivate = {
        isLoaded: target.isLoaded,
        url: target.currentView.webContents.getURL()
      }

      // Inilah yang dulu rusak: tombol muat ulang tidak melakukan apa pun pada
      // tab yang belum pernah memuat, sehingga satu-satunya jalan adalah
      // mengetik ulang di address bar.
      //
      // Ditekan lewat tombol di UI, bukan memanggil tab.reload() langsung, agar
      // seluruh rantai renderer -> preload -> IPC -> main ikut teruji.
      // Ditunggu lewat event, bukan polling `!isLoading()`: tepat setelah reload
      // dipanggil, pemuatan belum sempat dimulai sehingga isLoading() masih
      // false dan polling langsung lolos pada halaman yang masih kosong.
      const wc = target.currentView.webContents
      const stopped = new Promise<void>((resolve) => wc.once('did-stop-loading', () => resolve()))
      const clicked: boolean = await shell.chromeView.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('[data-action="reload"]')
          if (!btn || btn.disabled) return false
          btn.click()
          return true
        })()
      `)
      await Promise.race([stopped, sleep(10_000)])

      return {
        clicked,
        afterActivate,
        savedURL: target.url,
        loadedURL: wc.getURL(),
        isLoaded: target.isLoaded,
        body: await wc.executeJavaScript('document.body.innerText')
      }
    })

    await closeApp(app)

    expect(result).not.toBeNull()
    // Setelah diaktifkan halaman masih kosong — perilaku yang memang diinginkan.
    expect(result!.afterActivate.isLoaded).toBe(false)
    expect(result!.afterActivate.url).toBe('')

    // Tombol muat ulang memang bisa ditekan (tidak dinonaktifkan), lalu memuat
    // URL yang tersimpan.
    expect(result!.clicked).toBe(true)
    expect(result!.isLoaded).toBe(true)
    expect(result!.loadedURL).toBe(result!.savedURL)
    expect(result!.body).toContain('cookies=[')
  })
})
