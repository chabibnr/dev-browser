import { describe, expect, it } from 'vitest'
import { prettyURL, SEARCH_URL, toNavigationURL } from '@shared/url'

describe('mesin pencari', () => {
  it('memakai Google', () => {
    expect(SEARCH_URL).toBe('https://www.google.com/search?q=')
    expect(toNavigationURL('kucing lucu')).toBe('https://www.google.com/search?q=kucing%20lucu')
  })
})

describe('toNavigationURL', () => {
  it('mempertahankan URL yang sudah lengkap', () => {
    expect(toNavigationURL('https://a.b/c?d=1')).toBe('https://a.b/c?d=1')
    expect(toNavigationURL('http://example.com/')).toBe('http://example.com/')
  })

  it('menambahkan https untuk nama host telanjang', () => {
    expect(toNavigationURL('google.com')).toBe('https://google.com')
    expect(toNavigationURL('  github.com/anthropics  ')).toBe('https://github.com/anthropics')
  })

  it('memakai http untuk localhost dan alamat IP', () => {
    expect(toNavigationURL('localhost:3000')).toBe('http://localhost:3000')
    expect(toNavigationURL('127.0.0.1:8080/api')).toBe('http://127.0.0.1:8080/api')
  })

  it('memperlakukan teks biasa sebagai kueri pencarian', () => {
    expect(toNavigationURL('apa itu electron')).toBe(`${SEARCH_URL}apa%20itu%20electron`)
    // Satu kata tanpa titik bukan nama host.
    expect(toNavigationURL('electron')).toBe(`${SEARCH_URL}electron`)
  })

  it('menerima skema lokal', () => {
    expect(toNavigationURL('file:///C:/x.html')).toBe('file:///C:/x.html')
    expect(toNavigationURL('about:blank')).toBe('about:blank')
    expect(toNavigationURL('browser://downloads')).toBe('browser://downloads')
  })

  it('tidak menavigasi skema berbahaya, melainkan mencarinya', () => {
    const result = toNavigationURL('javascript:alert(1)')
    expect(result.startsWith(SEARCH_URL)).toBe(true)
  })

  it('mengembalikan about:blank untuk input kosong', () => {
    expect(toNavigationURL('   ')).toBe('about:blank')
  })
})

describe('prettyURL', () => {
  it('menyembunyikan skema, www, dan slash penutup', () => {
    expect(prettyURL('https://www.google.com/')).toBe('google.com')
    expect(prettyURL('https://example.com/a/b?c=1')).toBe('example.com/a/b?c=1')
  })

  it('mengosongkan about:blank', () => {
    expect(prettyURL('about:blank')).toBe('')
  })
})
