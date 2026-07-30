import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Test ini menjalankan aplikasi Electron sungguhan terhadap server HTTP lokal,
 * lalu memeriksa apakah cookie benar-benar tidak bocor antar tab.
 *
 * Ini inti dari seluruh aplikasi, jadi diuji melawan Chromium asli — bukan mock.
 * Server lokal dipakai supaya hasilnya deterministik dan tidak butuh internet.
 */

let server: http.Server
let port: number
let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/set') {
      const value = url.searchParams.get('v') ?? 'none'
      res.writeHead(200, {
        'Set-Cookie': `who=${value}; Path=/`,
        'Content-Type': 'text/html'
      })
      res.end(`<body>set ${value}</body>`)
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<body>cookies=[${req.headers.cookie ?? ''}]</body>`)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-test-'))

  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER_USER_DATA: userDataDir,
      BROWSER_TEST_HOOKS: '1',
      NODE_ENV: 'test'
    }
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

/**
 * `electron.launch()` sudah resolve begitu app siap, sedangkan kait test baru
 * dipasang setelah window dan TabManager terbentuk. Tunggu sampai benar-benar ada.
 */
async function waitForHooks(): Promise<void> {
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

/** Menjalankan skenario di dalam main process lewat kait test. */
async function run(basePort: number): Promise<{
  sameTab: string
  otherTab: string
  inheritedTab: string
  sessionIds: string[]
}> {
  return app.evaluate(async (_electron, p: number) => {
    const hooks = (globalThis as unknown as { __browser: { tm: any } }).__browser
    const tm = hooks.tm
    const base = `http://127.0.0.1:${p}`

    const load = async (tab: any, url: string): Promise<string> => {
      await tab.navigate(url)
      const wc = tab.currentView.webContents
      if (wc.isLoading()) {
        await new Promise<void>((resolve) => wc.once('did-stop-loading', () => resolve()))
      }
      return wc.executeJavaScript('document.body.innerText')
    }

    // Tab 1 menyetel cookie, lalu membacanya kembali di sesinya sendiri.
    const tab1 = tm.create(`${base}/set?v=tab1`)
    await load(tab1, `${base}/set?v=tab1`)
    const sameTab = await load(tab1, `${base}/read`)

    // Tab 2 dibuat manual -> sesi baru -> tidak boleh melihat cookie tab 1.
    const tab2 = tm.create(`${base}/read`)
    const otherTab = await load(tab2, `${base}/read`)

    // Tab hasil window.open mewarisi sesi induknya -> HARUS melihat cookie tab 1.
    const tab3 = tm.create(`${base}/read`, { inheritSessionFrom: tab1.sessionId })
    const inheritedTab = await load(tab3, `${base}/read`)

    return {
      sameTab,
      otherTab,
      inheritedTab,
      sessionIds: [tab1.sessionId, tab2.sessionId, tab3.sessionId]
    }
  }, basePort)
}

describe('isolasi sesi per tab', () => {
  it('memisahkan cookie antar tab, dan membaginya pada tab warisan', async () => {
    await waitForHooks()
    const result = await run(port)

    // Tab yang sama tetap ingat cookie-nya sendiri.
    expect(result.sameTab).toContain('who=tab1')

    // Inti fiturnya: tab lain sama sekali tidak melihat cookie itu.
    expect(result.otherTab).not.toContain('who=tab1')
    expect(result.otherTab).toContain('cookies=[]')

    // Tab hasil window.open berbagi sesi induk, jika tidak login OAuth akan rusak.
    expect(result.inheritedTab).toContain('who=tab1')

    // Tab manual mendapat sesi sendiri; tab warisan memakai sesi yang sama.
    const [s1, s2, s3] = result.sessionIds
    expect(s1).not.toBe(s2)
    expect(s3).toBe(s1)

    // Tiap sesi punya folder terpisah di disk (diperiksa dari luar aplikasi).
    const sessionDirs = fs.readdirSync(path.join(userDataDir, 'sessions'))
    expect(sessionDirs).toContain(s1)
    expect(sessionDirs).toContain(s2)
  })
})
