import { useEffect, useRef, useState } from 'react'
import type { FindResult } from '@shared/types'

interface Props {
  tabId: string | null
}

export default function FindBar({ tabId }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    return window.browser.onFindResult((next) => {
      if (next.tabId === tabId) setResult(next)
    })
  }, [tabId])

  function search(text: string, findNext: boolean): void {
    if (!tabId) return
    if (text === '') setResult(null)
    void window.browser.find(tabId, text, findNext)
  }

  const count = result && query ? `${result.activeMatchOrdinal}/${result.matches}` : ''
  const notFound = !!query && result?.matches === 0

  return (
    <div className="findbar">
      <input
        ref={inputRef}
        className={`findbar__input${notFound ? ' findbar__input--empty' : ''}`}
        placeholder="Cari di halaman"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          // findNext=false memulai pencarian baru dari atas setiap kali teks berubah.
          search(e.target.value, false)
        }}
        onKeyDown={(e) => {
          // Escape sengaja tidak ditangani di sini — main process yang menutup
          // find bar, agar jalurnya satu saja.
          if (e.key === 'Enter') search(query, true)
        }}
      />
      <span className="findbar__count">{count}</span>
      <button className="findbar__btn" title="Berikutnya (Enter)" onClick={() => search(query, true)}>
        ↓
      </button>
      <button
        className="findbar__btn"
        title="Tutup (Esc)"
        onClick={() => {
          if (tabId) void window.browser.stopFind(tabId)
          void window.browser.setChromeMode('strip')
        }}
      >
        ✕
      </button>
    </div>
  )
}
