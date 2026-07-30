import type { WebContents } from 'electron'

/**
 * Menyinkronkan scroll, klik, dan isian form antar viewport.
 *
 * Dikerjakan lewat CDP (`webContents.debugger`), BUKAN preload. Halaman yang
 * dibuka di sini adalah situs sembarangan, dan memberinya preload berarti
 * membuka jalur IPC ke main process. `Runtime.addBinding` hanya memberi halaman
 * satu fungsi untuk melapor ke kita — tidak ada akses balik.
 *
 * Klik dan isian disinkron berdasarkan SELEKTOR elemen, bukan koordinat: pada
 * lebar viewport berbeda, tombol yang sama berada di posisi yang berbeda pula.
 */

const BINDING = '__respSync'

/**
 * Skrip yang ditanam ke tiap halaman. Menahan diri saat `__respApply` menyala,
 * jika tidak, perubahan yang kita terapkan akan terpantul balik tanpa henti.
 */
const INJECT = `(() => {
  if (window.__respInit) return
  window.__respInit = true
  window.__respApply = false

  const send = (p) => { try { window.${BINDING}(JSON.stringify(p)) } catch (e) {} }

  const selectorOf = (el) => {
    if (!el || el.nodeType !== 1) return null
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 14) {
      const tag = node.tagName.toLowerCase()
      const parent = node.parentElement
      if (!parent) break
      const twins = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName)
      parts.unshift(twins.length > 1 ? tag + ':nth-of-type(' + (twins.indexOf(node) + 1) + ')' : tag)
      node = parent
    }
    return parts.length ? 'body > ' + parts.join(' > ') : null
  }

  const scrollRatio = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max > 0 ? window.scrollY / max : 0
  }

  let queued = false
  addEventListener('scroll', () => {
    if (window.__respApply || queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; send({ t: 's', r: scrollRatio() }) })
  }, { passive: true })

  addEventListener('click', (e) => {
    if (window.__respApply) return
    const sel = selectorOf(e.target)
    if (sel) send({ t: 'c', p: sel })
  }, true)

  addEventListener('input', (e) => {
    if (window.__respApply) return
    const el = e.target
    if (!el || typeof el.value !== 'string') return
    const sel = selectorOf(el)
    if (sel) send({ t: 'i', p: sel, v: el.value })
  }, true)
})()`

/** Membungkus penerapan dengan penanda agar tidak memantul balik. */
function guarded(body: string): string {
  return `(() => {
    window.__respApply = true
    try { ${body} } catch (e) {}
    requestAnimationFrame(() => { window.__respApply = false })
  })()`
}

const quote = (value: string): string => JSON.stringify(value)

interface Entry {
  id: string
  wc: WebContents
  attached: boolean
}

export class ViewportSync {
  private entries = new Map<string, Entry>()
  private enabled = true

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async add(id: string, wc: WebContents, mobile: boolean): Promise<void> {
    const entry: Entry = { id, wc, attached: false }
    this.entries.set(id, entry)

    try {
      wc.debugger.attach('1.3')
      entry.attached = true
    } catch (err) {
      // Terjadi bila DevTools dibuka pada view yang sama — hanya satu debugger
      // yang boleh terpasang. Viewport tetap jalan, sinkronisasinya saja mati.
      console.error(`[responsive] debugger gagal terpasang untuk ${id}:`, err)
      return
    }

    wc.debugger.on('message', (_event, method, params) => {
      if (method !== 'Runtime.bindingCalled') return
      const payload = params as { name?: string; payload?: string }
      if (payload.name !== BINDING || !payload.payload) return
      this.relay(id, payload.payload)
    })

    try {
      await wc.debugger.sendCommand('Runtime.enable')
      await wc.debugger.sendCommand('Page.enable')
      await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING })
      await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: INJECT })
      // Halaman yang sudah terlanjur dimuat tidak terkena skrip di atas.
      await wc.debugger.sendCommand('Runtime.evaluate', { expression: INJECT })

      if (mobile) {
        await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: true,
          maxTouchPoints: 5
        })
        await wc.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', {
          enabled: true,
          configuration: 'mobile'
        })
      }
    } catch (err) {
      console.error(`[responsive] gagal menyiapkan sinkronisasi untuk ${id}:`, err)
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id)
    this.entries.delete(id)
    if (!entry?.attached) return
    try {
      if (!entry.wc.isDestroyed() && entry.wc.debugger.isAttached()) entry.wc.debugger.detach()
    } catch {
      // View sudah dibongkar; tidak ada yang perlu dilepas.
    }
  }

  clear(): void {
    for (const id of [...this.entries.keys()]) this.remove(id)
  }

  private relay(fromId: string, raw: string): void {
    if (!this.enabled) return

    let event: { t: string; r?: number; p?: string; v?: string }
    try {
      event = JSON.parse(raw)
    } catch {
      return
    }

    const script = this.scriptFor(event)
    if (!script) return

    for (const entry of this.entries.values()) {
      if (entry.id === fromId || entry.wc.isDestroyed()) continue
      entry.wc.executeJavaScript(script).catch(() => {
        // Halaman sedang berpindah; peristiwa ini boleh hilang.
      })
    }
  }

  private scriptFor(event: { t: string; r?: number; p?: string; v?: string }): string | null {
    switch (event.t) {
      case 's': {
        if (typeof event.r !== 'number') return null
        // Disinkron per RASIO, bukan piksel: pada lebar berbeda, tinggi halaman
        // ikut berbeda, sehingga offset piksel yang sama menunjuk isi yang lain.
        return guarded(`
          const max = document.documentElement.scrollHeight - window.innerHeight
          if (max > 0) window.scrollTo(0, max * ${event.r})
        `)
      }
      case 'c': {
        if (!event.p) return null
        return guarded(`
          const el = document.querySelector(${quote(event.p)})
          if (el) el.click()
        `)
      }
      case 'i': {
        if (!event.p || typeof event.v !== 'string') return null
        return guarded(`
          const el = document.querySelector(${quote(event.p)})
          if (el && 'value' in el) {
            el.value = ${quote(event.v)}
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        `)
      }
      default:
        return null
    }
  }
}
