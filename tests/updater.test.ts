import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Pembaruan otomatis hanya berjalan bila tiga hal benar sekaligus, dan
 * ketiganya gagal secara diam-diam kalau salah — tidak ada yang meledak,
 * pembaruannya saja yang tidak pernah terjadi. Karena itu semuanya diuji.
 */

const builderYml = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf-8')
const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))

describe('konfigurasi paket', () => {
  it('menuliskan sumber pembaruan, tanpanya app-update.yml tidak pernah dibuat', () => {
    expect(builderYml).toMatch(/^publish:$/m)
    expect(builderYml).toMatch(/^\s+provider: github$/m)
    expect(builderYml).toMatch(/^\s+owner: \S+$/m)
    expect(builderYml).toMatch(/^\s+repo: \S+$/m)
  })

  it('memaketkan node_modules, tanpanya electron-updater tidak ikut ke asar', () => {
    // Terverifikasi langsung: build tanpa baris ini menghasilkan asar tanpa satu
    // pun entri node_modules, dan aplikasi terpasang gagal saat memeriksa versi.
    expect(builderYml).toMatch(/^\s+- node_modules\/\*\*$/m)
  })

  it('memberi installer nama tanpa spasi, agar cocok dengan latest.yml', () => {
    // GitHub mengubah spasi pada nama aset yang diunggah, sedangkan
    // electron-updater mengunduh nama persis seperti tertulis di latest.yml.
    // Satu spasi saja membuat setiap pembaruan berakhir 404.
    const artifact = builderYml.match(/^\s+artifactName: (.+)$/m)?.[1]
    expect(artifact).toBeTruthy()
    expect(artifact).not.toMatch(/\s|\$\{productName\}/)
  })

  it('menaruh electron-updater di dependencies, bukan devDependencies', () => {
    // electron-builder hanya memaketkan pohon dependensi produksi. Dipindah ke
    // devDependencies berarti modulnya hilang dari aplikasi terpasang.
    expect(pkg.dependencies?.['electron-updater']).toBeTruthy()
    expect(pkg.devDependencies?.['electron-updater']).toBeUndefined()
  })
})

let app: ElectronApplication
let userDataDir: string

beforeAll(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydevbrowser-upd-'))
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER_USER_DATA: userDataDir,
      BROWSER_TEST_HOOKS: '1',
      NODE_ENV: 'test'
    },
    timeout: 20_000
  })
  await app.evaluate(async () => {
    const g = globalThis as unknown as { __browser?: unknown }
    for (let i = 0; i < 200 && !g.__browser; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (!g.__browser) throw new Error('kait test tidak pernah siap')
  })
})

afterAll(async () => {
  await app?.close().catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 800))
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // Windows kadang masih mengunci folder sesi sesaat setelah keluar.
  }
})

describe('pembaruan otomatis', () => {
  it('tidak berjalan di aplikasi yang belum dipaketkan, dan tidak menggantung', async () => {
    // Di mode dev tidak ada app-update.yml. Yang penting: statusnya jujur
    // melaporkan itu, bukan menggantung selamanya di "memeriksa".
    const state = await app.evaluate(async () => {
      const g = globalThis as unknown as { __browser: { updateState?: () => unknown } }
      return g.__browser.updateState?.() ?? null
    })

    expect(state).toMatchObject({ status: 'unsupported' })
  })

  it('memeriksa pembaruan tidak pernah melempar, apa pun hasilnya', async () => {
    // Jaringan mati, repo belum ada, atau rilis masih draft — semuanya berakhir
    // sebagai status, bukan sebagai pengecualian yang menjatuhkan main process.
    const result = await app.evaluate(async () => {
      const g = globalThis as unknown as { __browser: { checkUpdate?: () => Promise<void> } }
      if (!g.__browser.checkUpdate) return 'kait tidak ada'
      try {
        await g.__browser.checkUpdate()
        return 'selesai'
      } catch (error) {
        return `melempar: ${(error as Error).message}`
      }
    })

    expect(result).toBe('selesai')
  })
})
