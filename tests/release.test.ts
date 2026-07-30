import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Pipeline rilis punya satu sifat buruk: kesalahannya baru terlihat setelah
 * build 100 MB selesai dan aset gagal diunggah, atau — lebih buruk — setelah
 * rilis terbit tapi tidak ada satu pun klien yang melihatnya. Jadi kaitan
 * antar-berkasnya dikunci di sini, bukan diserahkan ke CI.
 */

const root = process.cwd()
const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf-8')
const builderYml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf-8')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version

describe('workflow rilis', () => {
  it('hanya dipicu branch release, tidak pernah master', () => {
    // master adalah tempat kerja sehari-hari. Kalau pemicunya kembali ke master,
    // commit pertama yang kebetulan menaikkan versi langsung terbit ke publik
    // tanpa ada seorang pun yang bermaksud merilis.
    //
    // Kuncinya dibaca sebagai boolean `true`, bukan string "on" — YAML 1.1
    // memperlakukan on/off/yes/no sebagai boolean, dan GitHub tetap memakainya.
    const parsed = yaml.load(workflow) as Record<string, unknown>
    const trigger = (parsed[String(true)] ?? parsed['on']) as {
      push?: { branches?: string[] }
    }

    expect(trigger.push?.branches).toEqual(['release'])
  })

  it('mengunggah nama berkas yang sama persis dengan artifactName', () => {
    // Workflow menyebut nama installer secara literal. Kalau artifactName di
    // electron-builder.yml diubah, langkah unggah gagal — setelah build selesai.
    const template = builderYml.match(/^\s+artifactName: (.+)$/m)?.[1]
    expect(template).toBeTruthy()

    const expected = template!.replace('${version}', '$version').replace('${ext}', 'exe')
    expect(workflow).toContain(`"release/${expected}"`)
    expect(workflow).toContain(`"release/${expected}.blockmap"`)
  })

  it('mengunggah latest.yml, tanpanya tidak ada klien yang tahu ada versi baru', () => {
    expect(workflow).toContain('"release/latest.yml"')
  })

  it('melarang electron-builder menerbitkan sendiri', () => {
    // Default electron-builder adalah rilis DRAFT, dan draft tidak terlihat oleh
    // electron-updater sama sekali. Rilisnya dibuat `gh` agar langsung published.
    expect(workflow).toContain('--publish never')
  })

  it('menjalankan test sebelum membangun installer', () => {
    expect(workflow.indexOf('npm test')).toBeGreaterThan(-1)
    expect(workflow.indexOf('npm test')).toBeLessThan(workflow.indexOf('npm run dist'))
  })
})

describe('catatan rilis', () => {
  const script = path.join(root, 'scripts/release-notes.mjs')

  it('menyusun catatan untuk versi yang sedang aktif', () => {
    const out = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf-8' })
    expect(out).toContain(`DEV Browser ${version}`)
    expect(out).toMatch(/^- .+$/m)
  })

  it('menolak versi yang belum punya entri changelog', () => {
    // Ini yang memaksa disiplin "naikkan versi, tulis perubahannya" — CI berhenti
    // di sini alih-alih menerbitkan rilis tanpa keterangan apa pun.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-'))
    fs.mkdirSync(path.join(dir, 'src/shared'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '99.0.0' }))
    fs.copyFileSync(
      path.join(root, 'src/shared/changelog.ts'),
      path.join(dir, 'src/shared/changelog.ts')
    )

    let failed = false
    try {
      execFileSync(process.execPath, [script], { cwd: dir, stdio: 'pipe' })
    } catch {
      failed = true
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }

    expect(failed).toBe(true)
  })
})
