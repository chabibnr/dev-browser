import { readFileSync } from 'node:fs'

/**
 * Mencetak catatan rilis untuk versi yang sedang ada di package.json, diambil
 * dari CHANGELOG.
 *
 * Sengaja keluar dengan galat bila versinya tidak punya entri changelog. Rilis
 * tanpa catatan perubahan tidak ada gunanya bagi siapa pun, dan lebih baik CI
 * berhenti di sini daripada menerbitkan rilis kosong.
 */

const version = JSON.parse(readFileSync('package.json', 'utf-8')).version
const source = readFileSync('src/shared/changelog.ts', 'utf-8')

const anchor = source.indexOf(`version: '${version}'`)
if (anchor === -1) {
  console.error(
    `Versi ${version} tidak ada di src/shared/changelog.ts.\n` +
      `Tambahkan entrinya sebelum merilis, atau naikkan version di package.json.`
  )
  process.exit(1)
}

// Blok changes: [...] milik entri ini saja — dibatasi kurung siku penutup
// pertama setelah anchor, karena isinya hanya deretan string tanpa sarang.
const start = source.indexOf('changes: [', anchor)
const end = source.indexOf(']', start)
if (start === -1 || end === -1) {
  console.error(`Entri changelog ${version} tidak punya blok changes yang utuh.`)
  process.exit(1)
}

const changes = Array.from(
  source.slice(start, end).matchAll(/'((?:[^'\\]|\\.)*)'/g),
  (match) => match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
)

if (changes.length === 0) {
  console.error(`Entri changelog ${version} kosong.`)
  process.exit(1)
}

const lines = [
  `## DEV Browser ${version}`,
  '',
  ...changes.map((change) => `- ${change}`),
  '',
  '---',
  '',
  'Unduh `dev-browser-' + version + '-setup.exe` di bawah.',
  '',
  'Buildnya belum ditandatangani, jadi SmartScreen akan memperingatkan pemasangan',
  'pertama — pilih **More info → Run anyway**. Versi berikutnya dipasang sendiri',
  'lewat pembaruan otomatis di dalam aplikasi.'
]

console.log(lines.join('\n'))
