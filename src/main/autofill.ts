import type { WebContents } from 'electron'
import { credentialsFor, findCredential, getPassword, isBlocked, matches } from './credentials'

/**
 * Deteksi dan pengisian form login.
 *
 * Halaman web TIDAK diberi preload — itu invarian keamanan aplikasi ini. Jadi
 * jalurnya dibuat satu arah masing-masing:
 *
 *   main -> halaman : `executeJavaScript`, tanpa perlu apa pun di sisi halaman
 *   halaman -> main : pesan console dengan penanda, dibaca lewat event
 *                     `console-message`
 *
 * Debugger CDP sengaja tidak dipakai walau lebih rapi: hanya satu debugger yang
 * boleh terpasang pada satu webContents, dan memakainya di sini akan mematikan
 * DevTools (F12) di seluruh tab.
 */

const MARKER = '__mdb_credentials__'

/** Mencari field sandi dan field nama pengguna terdekat sebelum ia. */
const FIND_FIELDS = `
  const pw = document.querySelector('input[type="password"]')
  let user = null
  if (pw) {
    const scope = pw.form || document
    const inputs = Array.prototype.slice.call(scope.querySelectorAll('input'))
    for (let i = inputs.indexOf(pw) - 1; i >= 0; i--) {
      const t = (inputs[i].type || '').toLowerCase()
      if (t === 'text' || t === 'email' || t === 'tel') { user = inputs[i]; break }
    }
  }
`

const DETECT_SCRIPT = `(() => {
  if (window.__mdbAutofill) return
  window.__mdbAutofill = true

  const report = () => {
    ${FIND_FIELDS}
    if (!pw || !pw.value) return
    console.debug(${JSON.stringify(MARKER)} + JSON.stringify({
      u: user ? user.value : '',
      p: pw.value
    }))
  }

  // Banyak aplikasi satu-halaman tidak pernah memicu 'submit', jadi klik tombol
  // dan tombol Enter ikut diawasi. Duplikatnya disaring di main process.
  addEventListener('submit', report, true)
  addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('button, input[type="submit"]')
    if (el) setTimeout(report, 0)
  }, true)
  addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setTimeout(report, 0)
  }, true)
})()`

function fillScript(username: string, password: string): string {
  return `(() => {
    ${FIND_FIELDS}
    if (!pw) return false

    const set = (el, value) => {
      if (!el) return
      /*
       * Setter native dipanggil lewat prototipe, bukan el.value = value.
       * React menyimpan nilai terakhir yang ia ketahui dan akan MEMBATALKAN
       * perubahan yang tidak lewat setter aslinya — form jadi terlihat terisi
       * lalu kosong kembali begitu komponennya render ulang.
       */
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
      if (desc && desc.set) desc.set.call(el, value)
      else el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    set(user, ${JSON.stringify(username)})
    set(pw, ${JSON.stringify(password)})
    return true
  })()`
}

export interface SavePrompt {
  origin: string
  username: string
  password: string
}

/** Origin halaman saat ini, atau null bila skemanya tidak relevan. */
export function originOf(wc: WebContents): string | null {
  try {
    const url = new URL(wc.getURL())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** Menanam pengawas form. Dipanggil pada tiap dokumen baru. */
export function installDetector(wc: WebContents): void {
  wc.executeJavaScript(DETECT_SCRIPT).catch(() => {
    // Halaman sedang berpindah atau menolak eksekusi; tidak apa-apa.
  })
}

/**
 * Mengisi form bila ada TEPAT SATU kredensial untuk origin ini.
 *
 * Dengan dua atau lebih, pengisian otomatis akan menebak akun — dan pada browser
 * yang justru dipakai untuk banyak akun sekaligus, salah tebak itu merugikan.
 * Pilihannya diserahkan ke pengguna lewat tombol kunci di toolbar.
 */
export async function autofillIfUnambiguous(wc: WebContents): Promise<boolean> {
  const origin = originOf(wc)
  if (!origin) return false

  const found = credentialsFor(origin)
  if (found.length !== 1) return false

  const password = await getPassword(found[0]!.id)
  if (password === null) return false

  return fill(wc, found[0]!.username, password)
}

export async function fillById(wc: WebContents, id: string): Promise<boolean> {
  const entry = findCredential(id)
  if (!entry) return false
  const password = await getPassword(id)
  if (password === null) return false
  return fill(wc, entry.username, password)
}

async function fill(wc: WebContents, username: string, password: string): Promise<boolean> {
  try {
    return (await wc.executeJavaScript(fillScript(username, password))) === true
  } catch {
    return false
  }
}

/**
 * Membaca laporan dari halaman.
 *
 * Origin diambil dari webContents, BUKAN dari isi laporan — halaman tidak boleh
 * bisa menentukan atas nama origin mana kredensial disimpan.
 */
export async function readReport(
  wc: WebContents,
  isMainFrame: boolean,
  message: string
): Promise<SavePrompt | null> {
  if (!isMainFrame || !message.startsWith(MARKER)) return null

  const origin = originOf(wc)
  if (!origin || isBlocked(origin)) return null

  let payload: { u?: unknown; p?: unknown }
  try {
    payload = JSON.parse(message.slice(MARKER.length))
  } catch {
    return null
  }

  const username = typeof payload.u === 'string' ? payload.u : ''
  const password = typeof payload.p === 'string' ? payload.p : ''
  if (password === '') return null

  // Sandi yang sudah tersimpan sama persis tidak perlu ditawarkan lagi.
  if (await matches(origin, username, password)) return null

  return { origin, username, password }
}
