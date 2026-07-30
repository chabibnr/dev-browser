import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Window kedua harus benar-benar terpisah: kumpulan tabnya sendiri, sesinya
 * sendiri, dan state-nya tersimpan berdampingan — bukan saling menimpa.
 */

let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-multi-'))
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
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // Windows kadang masih mengunci folder sesi sesaat setelah keluar.
  }
})

describe('banyak window', () => {
  it('memberi window baru kumpulan tab dan sesi sendiri', async () => {
    const result = await app.evaluate(async () => {
      const hooks = (
        globalThis as unknown as { __browser: { tm: any; createWindow: any; allContexts: any } }
      ).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const firstTm = hooks.tm
      const firstTab = firstTm.create('about:blank')
      firstTm.rename(firstTab.id, 'Window 1')

      const second = hooks.createWindow()
      await sleep(800)

      const secondTab = second.tm.create('about:blank')
      second.tm.rename(secondTab.id, 'Window 2')
      await sleep(400)

      return {
        contexts: hooks.allContexts().length,
        // Tab window pertama tidak boleh bocor ke window kedua dan sebaliknya.
        firstHasSecondTab: !!firstTm.find(secondTab.id),
        secondHasFirstTab: !!second.tm.find(firstTab.id),
        firstNames: firstTm.all.map((t: any) => t.customTitle),
        secondNames: second.tm.all.map((t: any) => t.customTitle),
        // Sesi tetap unik per tab, lintas window sekalipun.
        allSessionIds: [
          ...firstTm.all.map((t: any) => t.sessionId),
          ...second.tm.all.map((t: any) => t.sessionId)
        ],
        // UI tiap window punya webContents sendiri.
        distinctChromeIds:
          hooks.allContexts()[0].chromeWebContentsId !== hooks.allContexts()[1].chromeWebContentsId
      }
    })

    expect(result.contexts).toBe(2)
    expect(result.firstHasSecondTab).toBe(false)
    expect(result.secondHasFirstTab).toBe(false)
    expect(result.firstNames).toContain('Window 1')
    expect(result.firstNames).not.toContain('Window 2')
    expect(result.secondNames).toContain('Window 2')
    expect(result.distinctChromeIds).toBe(true)

    // Tidak ada satu pun sesi yang dipakai dua tab.
    expect(new Set(result.allSessionIds).size).toBe(result.allSessionIds.length)
  })

  it('menyembunyikan Window Manager ke tray saat diminimalkan, bukan ke taskbar', async () => {
    /*
     * Window Manager memakai skipTaskbar, jadi ia tidak punya entri di taskbar.
     * Karena itu diminimalkan HARUS berarti disembunyikan sepenuhnya — kalau
     * hanya diminimalkan, window itu tidak bisa dipanggil kembali dari mana pun
     * selain tray, dan pada beberapa keadaan tidak terlihat sama sekali.
     */
    const result = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { manager: any; hasTray: any } })
        .__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const win = hooks.manager.window
      const before = win.isVisible()

      win.minimize()
      await sleep(600)
      const afterMinimize = { visible: win.isVisible() }

      // Dipanggil kembali seperti lewat klik ikon tray.
      hooks.manager.focus()
      await sleep(600)

      return {
        trayReady: hooks.hasTray(),
        before,
        afterMinimize,
        afterShow: { visible: win.isVisible(), minimized: win.isMinimized() }
      }
    })

    // Ikon tray memang terpasang — itu satu-satunya jalan kembali.
    expect(result.trayReady).toBe(true)
    expect(result.before).toBe(true)
    // Diminimalkan = hilang sepenuhnya, bukan mengecil.
    expect(result.afterMinimize.visible).toBe(false)
    // Dipanggil dari tray: muncul lagi dan tidak tertinggal dalam keadaan minimize.
    expect(result.afterShow.visible).toBe(true)
    expect(result.afterShow.minimized).toBe(false)
  })

  it('menyimpan tiap window sebagai profil terpisah', async () => {
    const stateFile = path.join(userDataDir, 'state.json')

    const before = await app.evaluate(async () => {
      const hooks = (globalThis as unknown as { __browser: { allContexts: any } }).__browser
      await new Promise((r) => setTimeout(r, 900))
      return hooks.allContexts().length
    })
    expect(before).toBe(2)

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    expect(saved.version).toBe(2)
    expect(saved.profiles.length).toBe(2)
  })

  it('mempertahankan profil setelah window-nya ditutup, dan bisa dibuka lagi', async () => {
    /*
     * Inilah perubahan pentingnya. Sebelum ada Window Manager, menutup salah satu
     * window membuang profilnya dari state — hanya window terakhir yang bisa
     * kembali. Sekarang profil bertahan dan bisa dibuka ulang dengan tab yang sama.
     */
    const result = await app.evaluate(async () => {
      const hooks = (
        globalThis as unknown as {
          __browser: { allContexts: any; allProfiles: any; openProfile: any }
        }
      ).__browser
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      const target = hooks.allContexts()[1]
      const profileId = target.profileId
      const tabIds = target.tm.all.map((t: any) => t.id).sort()
      const names = target.tm.all.map((t: any) => t.customTitle)

      target.shell.close()
      await sleep(900)

      const afterClose = {
        contexts: hooks.allContexts().length,
        // Profilnya HARUS masih ada, dengan tab yang tersimpan di dalamnya.
        stillListed: hooks.allProfiles().some((p: any) => p.id === profileId),
        savedTabIds: (hooks.allProfiles().find((p: any) => p.id === profileId)?.tabs ?? [])
          .map((t: any) => t.id)
          .sort()
      }

      // Dibuka lagi dari daftar profil, seperti lewat Window Manager.
      hooks.openProfile(profileId)
      await sleep(1200)

      const reopened = hooks.allContexts().find((c: any) => c.profileId === profileId)
      return {
        afterClose,
        originalTabIds: tabIds,
        originalNames: names,
        reopenedTabIds: reopened ? reopened.tm.all.map((t: any) => t.id).sort() : null,
        reopenedNames: reopened ? reopened.tm.all.map((t: any) => t.customTitle) : null
      }
    })

    // Setelah ditutup: window hilang, profilnya tidak.
    expect(result.afterClose.contexts).toBe(1)
    expect(result.afterClose.stillListed).toBe(true)
    expect(result.afterClose.savedTabIds).toEqual(result.originalTabIds)

    // Dibuka lagi: tab yang sama kembali, lengkap dengan namanya.
    expect(result.reopenedTabIds).toEqual(result.originalTabIds)
    expect(result.reopenedNames).toEqual(result.originalNames)
  })
})
