import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Menguji penyimpanan sandi dan pengisian otomatis terhadap halaman login nyata.
 *
 * Dua hal yang paling penting di sini: sandi TIDAK boleh tersimpan sebagai teks
 * biasa di disk, dan pengisian harus benar-benar sampai ke input halaman.
 */

const PASSWORD = 'rahasia-yang-sangat-khas-8471'
const USERNAME = 'budi@contoh.id'

let server: http.Server
let port: number
let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<body>
      <form id="login" action="/masuk" method="post">
        <input id="u" type="text" name="user" autocomplete="username">
        <input id="p" type="password" name="pass" autocomplete="current-password">
        <button type="submit">Masuk</button>
      </form>
    </body>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-cred-'))
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, BROWSER_USER_DATA: userDataDir, BROWSER_TEST_HOOKS: '1', NODE_ENV: 'test' },
    timeout: 20_000
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

describe('sandi tersimpan', () => {
  it('mengisi form login otomatis saat hanya ada satu kredensial', async () => {
    const result = await app.evaluate(
      async (_electron, args: { p: number; user: string; pass: string }) => {
        const hooks = (
          globalThis as unknown as {
            __browser: { tm: any; credentials: any }
          }
        ).__browser
        const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        const origin = `http://127.0.0.1:${args.p}`

        if (!hooks.credentials.isVaultAvailable()) return { skipped: true }

        await hooks.credentials.saveCredential(origin, args.user, args.pass)

        const tab = hooks.tm.create('about:blank')
        await tab.navigate(`${origin}/login`)
        const wc = tab.currentView.webContents
        if (wc.isLoading()) {
          await new Promise<void>((r) => wc.once('did-stop-loading', () => r()))
        }

        // Pengisian dipicu oleh dom-ready, jadi ditunggu sampai nilainya muncul.
        let filled = { u: '', p: '' }
        for (let i = 0; i < 100; i++) {
          filled = await wc.executeJavaScript(
            '({ u: document.getElementById("u").value, p: document.getElementById("p").value })'
          )
          if (filled.p) break
          await sleep(50)
        }

        return { skipped: false, filled, stored: hooks.credentials.listCredentials().length }
      },
      { p: port, user: USERNAME, pass: PASSWORD }
    )

    if (result.skipped) {
      // Enkripsi OS tidak tersedia di lingkungan ini; menyimpan sandi memang ditolak.
      expect(result.skipped).toBe(true)
      return
    }

    expect(result.stored).toBe(1)
    expect(result.filled!.u).toBe(USERNAME)
    expect(result.filled!.p).toBe(PASSWORD)
  })

  it('tidak menulis sandi sebagai teks biasa ke disk', async () => {
    const vaultPath = path.join(userDataDir, 'credentials.json')
    const raw = fs.readFileSync(vaultPath, 'utf-8')

    // Nama pengguna memang tersimpan apa adanya (itu bukan rahasia)…
    expect(raw).toContain(USERNAME)
    // …tapi sandinya tidak boleh muncul di mana pun dalam berkas itu.
    expect(raw).not.toContain(PASSWORD)

    // Seluruh folder profil juga diperiksa, bukan hanya vault-nya.
    const leaked: string[] = []
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(full)
          continue
        }
        try {
          if (fs.readFileSync(full).includes(PASSWORD)) leaked.push(full)
        } catch {
          // Berkas terkunci Chromium; lewati.
        }
      }
    }
    scan(userDataDir)
    expect(leaked).toEqual([])
  })

  it('menawarkan menyimpan setelah form login dikirim', async () => {
    const result = await app.evaluate(async (_electron, p: number) => {
      const hooks = (globalThis as unknown as { __browser: { tm: any; credentials: any } }).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const origin = `http://127.0.0.1:${p}`

      if (!hooks.credentials.isVaultAvailable()) return { skipped: true }

      // Vault dikosongkan supaya tawaran memang muncul karena kredensial BARU,
      // bukan tersisa dari test sebelumnya.
      for (const c of hooks.credentials.listCredentials()) hooks.credentials.deleteCredential(c.id)

      const tab = hooks.tm.create('about:blank')
      hooks.tm.activate(tab.id)
      await tab.navigate(`${origin}/login`)
      const wc = tab.currentView.webContents
      if (wc.isLoading()) {
        await new Promise<void>((r) => wc.once('did-stop-loading', () => r()))
      }
      await sleep(300)

      // Diisi lalu dikirim seperti pengguna sungguhan; laporannya mengalir lewat
      // pesan console, bukan preload.
      await wc.executeJavaScript(`
        document.getElementById('u').value = 'akun-baru'
        document.getElementById('p').value = 'sandi-baru-123'
        document.getElementById('login').dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        )
      `)

      let prompt: { origin: string; username: string } | null = null
      for (let i = 0; i < 100; i++) {
        const current = hooks.tm.savePrompt
        if (current) {
          prompt = { origin: current.origin, username: current.username }
          break
        }
        await sleep(50)
      }

      return { skipped: false, prompt, mode: hooks.tm.getState().mode }
    }, port)

    if (result.skipped) {
      expect(result.skipped).toBe(true)
      return
    }

    expect(result.prompt).not.toBeNull()
    expect(result.prompt!.username).toBe('akun-baru')
    expect(result.prompt!.origin).toBe(`http://127.0.0.1:${port}`)
    // Bilah tawaran muncul, yang berarti halaman digeser turun, bukan tertutup.
    expect(result.mode).toBe('strip-save')
  })
})
