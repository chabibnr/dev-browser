import { useEffect, useState } from 'react'
import type { ManagerState } from '@shared/types'
import WindowControls from '../components/WindowControls'
import AboutDialog from '../components/AboutDialog'

/**
 * Window Manager: daftar profil window.
 *
 * Tidak ada view halaman di window ini, jadi dialog cukup dirender apa adanya —
 * tidak perlu trik mode overlay seperti di window browser, karena tidak ada view
 * native yang bisa menimpanya.
 */
export default function Manager(): React.JSX.Element {
  const [state, setState] = useState<ManagerState | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    void window.browser.manager.getState().then((initial) => {
      if (initial) setState(initial)
    })
    return window.browser.manager.onChanged(setState)
  }, [])

  function startRename(id: string, current: string): void {
    setRenaming(id)
    setDraft(current)
  }

  function commitRename(): void {
    if (renaming && draft.trim()) void window.browser.manager.renameProfile(renaming, draft)
    setRenaming(null)
  }

  const profiles = state?.profiles ?? []

  return (
    <div className="mgr">
      <div className="mgr__bar">
        <span className="mgr__title">Window Manager</span>
        <div className="resp__spacer" />
        <WindowControls isMaximized={state?.isMaximized ?? false} />
      </div>

      <div className="page">
        <header className="page__head">
          <h1 className="page__title">Profil window</h1>
          <button
            className="page__action page__action--primary"
            onClick={() => void window.browser.manager.createProfile()}
          >
            Window baru
          </button>
          <button className="page__action" onClick={() => setAboutOpen(true)}>
            Tentang
          </button>
        </header>

        <p className="page__note">
          Tiap profil punya kumpulan tab dan sesinya sendiri. Menutup window tidak
          menghapus profilnya — bisa dibuka kembali dari sini kapan pun.
        </p>

        {profiles.length === 0 ? (
          <p className="page__empty">Belum ada profil.</p>
        ) : (
          <ul className="dl">
            {profiles.map((profile) => (
              <li key={profile.id} className="dl__row">
                <div className="dl__main">
                  {renaming === profile.id ? (
                    <input
                      className="dialog__input mgr__rename"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <span className="dl__name">
                      {profile.name}
                      {profile.isOpen && <span className="mgr__badge">terbuka</span>}
                    </span>
                  )}
                  <span className="dl__meta">
                    {profile.tabCount} tab
                    {profile.preview.length > 0 && <> · {profile.preview.join(' · ')}</>}
                  </span>
                </div>

                <div className="dl__actions">
                  {profile.isOpen ? (
                    <button
                      className="page__action"
                      onClick={() => void window.browser.manager.closeProfile(profile.id)}
                    >
                      Tutup
                    </button>
                  ) : (
                    <button
                      className="page__action page__action--primary"
                      onClick={() => void window.browser.manager.openProfile(profile.id)}
                    >
                      Buka
                    </button>
                  )}
                  <button
                    className="page__action"
                    onClick={() => startRename(profile.id, profile.name)}
                  >
                    Ganti nama
                  </button>
                  <button
                    className="page__action page__action--danger"
                    onClick={() => void window.browser.manager.deleteProfile(profile.id)}
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
