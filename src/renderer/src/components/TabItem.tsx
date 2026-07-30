import { useEffect, useRef, useState } from 'react'
import { displayTitle, type TabState } from '@shared/types'
import { tabColorValue } from '@shared/colors'
import Icon from './Icon'

interface Props {
  tab: TabState
  isActive: boolean
  isRenaming: boolean
  /** Ada tab lain yang memakai sesi yang sama (mis. popup warisan). */
  sharesSession: boolean
  onStartRename: () => void
  onEndRename: () => void
  onContextMenu: (x: number, y: number) => void
}

/**
 * Warna penanda sesi bersama. Tab yang berbagi sesi mendapat warna sama,
 * jadi terlihat langsung mana yang sebenarnya satu "profil".
 */
function sessionColor(sessionId: string): string {
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) hash = (hash * 31 + sessionId.charCodeAt(i)) | 0
  return `hsl(${Math.abs(hash) % 360} 65% 58%)`
}

export default function TabItem({
  tab,
  isActive,
  isRenaming,
  sharesSession,
  onStartRename,
  onEndRename,
  onContextMenu
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isRenaming) return
    setDraft(tab.customTitle ?? tab.pageTitle ?? '')
    // Fokus setelah input benar-benar terpasang.
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [isRenaming, tab.customTitle, tab.pageTitle])

  function commit(): void {
    // String kosong berarti kembali mengikuti judul halaman.
    void window.browser.renameTab(tab.id, draft.trim() === '' ? null : draft)
    onEndRename()
  }

  const label = displayTitle(tab)
  const color = tabColorValue(tab.color)

  return (
    <div
      className={`tab${isActive ? ' tab--active' : ''}${color ? ' tab--colored' : ''}`}
      data-tab-id={tab.id}
      // Warna diturunkan di CSS lewat color-mix, jadi di sini cukup satu variabel.
      style={color ? ({ '--tab-color': color } as React.CSSProperties) : undefined}
      title={tab.customTitle ? `${label}\n${tab.pageTitle || tab.url}` : tab.url}
      onMouseDown={(e) => {
        if (e.button === 0 && !isRenaming) void window.browser.activateTab(tab.id)
        // Klik tengah menutup tab, seperti browser pada umumnya.
        if (e.button === 1) {
          e.preventDefault()
          void window.browser.closeTab(tab.id)
        }
      }}
      onDoubleClick={onStartRename}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      {sharesSession && (
        <span
          className="tab__session"
          style={{ background: sessionColor(tab.sessionId) }}
          title={`Berbagi sesi ${tab.sessionId.slice(0, 8)} dengan tab lain`}
        />
      )}

      {tab.isLoading ? (
        <span className="tab__spinner" />
      ) : tab.favicon ? (
        <img className="tab__favicon" src={tab.favicon} alt="" />
      ) : (
        <span className="tab__favicon tab__favicon--empty" />
      )}

      {isRenaming ? (
        <input
          ref={inputRef}
          className="tab__rename"
          value={draft}
          placeholder="Nama tab"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') onEndRename()
            e.stopPropagation()
          }}
        />
      ) : (
        <span className="tab__title">{label}</span>
      )}

      <button
        className="tab__close"
        title="Tutup tab"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          void window.browser.closeTab(tab.id)
        }}
      >
        <Icon name="close" size={12} strokeWidth={2.6} />
      </button>
    </div>
  )
}
