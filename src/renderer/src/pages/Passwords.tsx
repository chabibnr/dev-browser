import { useCallback, useEffect, useState } from 'react'
import type { SavedCredential } from '@shared/types'

/** Halaman internal browser://passwords. */
export default function Passwords(): React.JSX.Element {
  const [items, setItems] = useState<SavedCredential[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const [available, setAvailable] = useState(true)
  // Sandi hanya diminta saat pengguna menekan "lihat", dan disimpan per-id
  // supaya membuka satu baris tidak membocorkan seluruh daftar.
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    const [list, blockedList, ok] = await Promise.all([
      window.browser.credentials.list(),
      window.browser.credentials.blocked(),
      window.browser.credentials.available()
    ])
    setItems(list)
    setBlocked(blockedList)
    setAvailable(ok)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function reveal(id: string): Promise<void> {
    if (revealed[id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return
    }
    const password = await window.browser.credentials.reveal(id)
    if (password !== null) setRevealed((prev) => ({ ...prev, [id]: password }))
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">Sandi tersimpan</h1>
      </header>

      {!available && (
        <p className="dialog__error">
          Enkripsi bawaan sistem tidak tersedia, jadi sandi baru tidak akan disimpan.
        </p>
      )}

      <p className="page__note">
        Sandi dienkripsi memakai kunci sistem operasi. Di Windows itu berarti
        terlindung dari pengguna lain di komputer ini, tapi tidak dari program lain
        yang berjalan sebagai Anda — sama seperti Chrome.
      </p>

      {items.length === 0 ? (
        <p className="page__empty">Belum ada sandi tersimpan.</p>
      ) : (
        <ul className="dl">
          {items.map((item) => (
            <li key={item.id} className="dl__row">
              <div className="dl__main">
                <span className="dl__name">{item.origin}</span>
                <span className="dl__meta">
                  {item.username || '(tanpa nama pengguna)'}
                  {revealed[item.id] !== undefined && (
                    <>
                      {' · '}
                      <code className="cred__secret">{revealed[item.id]}</code>
                    </>
                  )}
                </span>
              </div>
              <div className="dl__actions">
                <button className="page__action" onClick={() => void reveal(item.id)}>
                  {revealed[item.id] !== undefined ? 'Sembunyikan' : 'Lihat'}
                </button>
                <button
                  className="page__action"
                  onClick={async () => {
                    await window.browser.credentials.remove(item.id)
                    await refresh()
                  }}
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {blocked.length > 0 && (
        <>
          <h2 className="page__title page__title--sub">Situs yang tidak pernah ditawari</h2>
          <ul className="dl">
            {blocked.map((origin) => (
              <li key={origin} className="dl__row">
                <div className="dl__main">
                  <span className="dl__name">{origin}</span>
                </div>
                <button
                  className="page__action"
                  onClick={async () => {
                    await window.browser.credentials.unblock(origin)
                    await refresh()
                  }}
                >
                  Tawari lagi
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
