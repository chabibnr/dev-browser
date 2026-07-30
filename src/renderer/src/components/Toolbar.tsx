import { useEffect, useState, type RefObject } from 'react'
import { INTERNAL_DOWNLOADS, type TabState } from '@shared/types'
import { prettyURL } from '@shared/url'
import { tabColorValue } from '@shared/colors'
import Icon from './Icon'

interface Props {
  tab: TabState | null
  addressRef: RefObject<HTMLInputElement | null>
  activeDownloads: number
  onOpenSession: () => void
  credentialCount: number
}

export default function Toolbar({
  tab,
  addressRef,
  activeDownloads,
  onOpenSession,
  credentialCount
}: Props): React.JSX.Element {
  // `null` berarti "tampilkan URL tab"; string berarti pengguna sedang mengetik.
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    // URL tab berubah (pindah tab atau navigasi). Ketikan yang sedang berjalan
    // dipertahankan supaya tidak terhapus di tengah jalan.
    if (document.activeElement !== addressRef.current) setDraft(null)
  }, [tab?.id, tab?.url, addressRef])

  const value = draft ?? prettyURL(tab?.url ?? '')
  const disabled = !tab
  // Toolbar ikut warna tab yang sedang aktif, sehingga seluruh blok address bar
  // menegaskan "akun mana" yang sedang dilihat.
  const color = tabColorValue(tab?.color ?? null)

  return (
    <div
      className={`toolbar${color ? ' toolbar--colored' : ''}`}
      style={color ? ({ '--tab-color': color } as React.CSSProperties) : undefined}
    >
      <button
        className="toolbar__btn"
        data-action="back"
        title="Kembali (Alt+←)"
        disabled={disabled || !tab.canGoBack}
        onClick={() => tab && void window.browser.back(tab.id)}
      >
        <Icon name="back" />
      </button>
      <button
        className="toolbar__btn"
        data-action="forward"
        title="Maju (Alt+→)"
        disabled={disabled || !tab.canGoForward}
        onClick={() => tab && void window.browser.forward(tab.id)}
      >
        <Icon name="forward" />
      </button>
      <button
        className="toolbar__btn"
        data-action="reload"
        title={tab?.isLoading ? 'Hentikan' : 'Muat ulang (Ctrl+R)'}
        disabled={disabled}
        onClick={() => {
          if (!tab) return
          void (tab.isLoading ? window.browser.stop(tab.id) : window.browser.reload(tab.id))
        }}
      >
        <Icon name={tab?.isLoading ? 'stop' : 'reload'} />
      </button>

      <input
        ref={addressRef}
        className="toolbar__address"
        placeholder="Ketik alamat atau kata kunci pencarian"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && tab) {
            void window.browser.goto(tab.id, value)
            setDraft(null)
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />

      {/* Sisi kiri address bar hanya untuk navigasi (kembali, maju, muat ulang);
          alat bantu dikumpulkan di sisi kanan. */}
      <button
        className="toolbar__btn"
        data-action="responsive"
        title="Uji responsif di beberapa ukuran device (Ctrl+Shift+M)"
        disabled={disabled}
        onClick={() => tab && void window.browser.openResponsive(tab.id)}
      >
        <Icon name="devices" />
      </button>
      <button
        className="toolbar__btn toolbar__btn--badge"
        data-action="credentials"
        title="Sandi tersimpan untuk situs ini"
        disabled={disabled}
        onClick={(e) => {
          if (!tab) return
          const rect = e.currentTarget.getBoundingClientRect()
          void window.browser.credentials.showMenu(tab.id, rect.left, rect.bottom + 2)
        }}
      >
        <Icon name="key" />
        {credentialCount > 0 && <span className="toolbar__badge">{credentialCount}</span>}
      </button>
      <button
        className="toolbar__btn"
        title={tab ? `Sesi & proxy tab ini${tab.proxy ? ' (proxy aktif)' : ''}` : 'Sesi tab ini'}
        disabled={disabled}
        onClick={onOpenSession}
      >
        <Icon name={tab?.proxy ? 'shield-on' : 'shield'} />
      </button>
      <button
        className="toolbar__btn toolbar__btn--badge"
        title="Unduhan"
        onClick={() => void window.browser.openInternal(INTERNAL_DOWNLOADS)}
      >
        <Icon name="download" />
        {activeDownloads > 0 && <span className="toolbar__badge">{activeDownloads}</span>}
      </button>
      <button
        className="toolbar__btn"
        title="Cari di halaman (Ctrl+F)"
        disabled={disabled}
        onClick={() => void window.browser.setChromeMode('strip-find')}
      >
        <Icon name="search" />
      </button>
      <button
        className="toolbar__btn"
        title="DevTools tab ini (F12)"
        disabled={disabled}
        onClick={() => tab && void window.browser.toggleDevTools(tab.id)}
      >
        <Icon name="devtools" />
      </button>
    </div>
  )
}
