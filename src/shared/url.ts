/** Mesin pencari untuk input yang bukan URL. */
export const SEARCH_URL = 'https://www.google.com/search?q='

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'data:', 'browser:'])
const LOCALHOST_RE = /^localhost(:\d+)?([/?#]|$)/i
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/
/** Ada titik sebelum slash/tanda tanya pertama, mis. "google.com/search". */
const HOSTNAME_RE = /^[^\s/?#@]+\.[^\s/?#@]{2,}/

/**
 * Mengubah isi address bar menjadi URL navigasi.
 * Input yang bukan URL diperlakukan sebagai kueri pencarian.
 */
export function toNavigationURL(input: string): string {
  const raw = input.trim()
  if (!raw) return 'about:blank'

  if (SCHEME_RE.test(raw)) {
    try {
      const parsed = new URL(raw)
      if (ALLOWED_SCHEMES.has(parsed.protocol)) return parsed.toString()
    } catch {
      // URL cacat — jatuh ke penanganan di bawah.
    }
    // Skema yang tidak diizinkan (mis. javascript:) sengaja tidak dinavigasi.
    // "localhost:3000" juga sampai di sini karena "localhost:" terlihat seperti skema.
  }

  if (LOCALHOST_RE.test(raw) || IPV4_RE.test(raw)) return `http://${raw}`
  if (!/\s/.test(raw) && HOSTNAME_RE.test(raw)) return `https://${raw}`

  return SEARCH_URL + encodeURIComponent(raw)
}

/** Versi ringkas untuk ditampilkan di address bar (tanpa "https://" dan slash penutup). */
export function prettyURL(url: string): string {
  if (!url || url === 'about:blank') return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return url
    const tail = parsed.href.slice(parsed.origin.length)
    const host = parsed.host.replace(/^www\./, '')
    return tail === '/' ? host : host + tail
  } catch {
    return url
  }
}
