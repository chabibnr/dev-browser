import type { SavePromptState } from '@shared/types'

interface Props {
  prompt: SavePromptState
}

/**
 * Tawaran menyimpan sandi setelah form login dikirim.
 *
 * Bentuknya bilah, bukan dialog: pengguna harus tetap bisa melihat halaman yang
 * baru saja ia masuki untuk memastikan loginnya memang berhasil.
 *
 * Sandinya TIDAK ada di sini. Ia tetap di main process; komponen ini hanya
 * mengirim persetujuan.
 */
export default function SaveBar({ prompt }: Props): React.JSX.Element {
  const host = prompt.origin.replace(/^https?:\/\//, '')

  return (
    <div className="savebar">
      <span className="savebar__text">
        Simpan sandi untuk <strong>{host}</strong>
        {prompt.username && <> sebagai <strong>{prompt.username}</strong></>}?
      </span>
      <div className="savebar__actions">
        <button className="page__action" onClick={() => void window.browser.credentials.never()}>
          Jangan untuk situs ini
        </button>
        <button className="page__action" onClick={() => void window.browser.credentials.dismiss()}>
          Nanti
        </button>
        <button
          className="page__action page__action--primary"
          onClick={() => void window.browser.credentials.accept()}
        >
          Simpan
        </button>
      </div>
    </div>
  )
}
