import { useState } from 'react'
import type { ProxyConfig, TabState } from '@shared/types'

interface Props {
  tab: TabState
  onClose: () => void
}

/** Preset UA yang paling sering dibutuhkan; sisanya bisa diketik manual. */
const UA_PRESETS: { label: string; value: string | null }[] = [
  { label: 'Bawaan (Electron)', value: null },
  {
    label: 'Chrome di Windows',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
  },
  {
    label: 'Safari di iPhone',
    value:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  }
]

/**
 * Pengaturan sesi untuk satu tab.
 *
 * Dirender saat main process memasang mode `overlay`, yang membuat chromeView
 * menutupi seluruh window sehingga dialog punya ruang di luar bilah atas.
 */
export default function SessionDialog({ tab, onClose }: Props): React.JSX.Element {
  const [rules, setRules] = useState(tab.proxy?.rules ?? '')
  const [bypass, setBypass] = useState(tab.proxy?.bypass ?? '')
  const [username, setUsername] = useState(tab.proxy?.username ?? '')
  const [password, setPassword] = useState(tab.proxy?.password ?? '')
  const [userAgent, setUserAgent] = useState(tab.userAgent ?? '')
  const [busy, setBusy] = useState(false)

  async function apply(): Promise<void> {
    setBusy(true)
    try {
      const proxy: ProxyConfig | null =
        rules.trim() === ''
          ? null
          : {
              rules: rules.trim(),
              bypass: bypass.trim() || undefined,
              username: username.trim() || undefined,
              password: password || undefined
            }
      await window.browser.setProxy(tab.id, proxy)
      await window.browser.setUserAgent(tab.id, userAgent.trim() || null)
      // User-Agent hanya berlaku penuh pada navigasi berikutnya.
      await window.browser.reload(tab.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">Sesi tab ini</h2>
        <p className="dialog__hint">
          Sesi <code>{tab.sessionId.slice(0, 8)}</code> — cookie, storage, dan cache tab ini
          terpisah dari tab lain.
        </p>

        <label className="dialog__label">
          Proxy
          <input
            className="dialog__input"
            placeholder="http://127.0.0.1:8080 atau socks5://127.0.0.1:1080"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
        </label>

        <label className="dialog__label">
          Lewati proxy untuk
          <input
            className="dialog__input"
            placeholder="localhost,127.0.0.1,&lt;local&gt;"
            value={bypass}
            onChange={(e) => setBypass(e.target.value)}
          />
        </label>

        <div className="dialog__row">
          <label className="dialog__label">
            Pengguna proxy
            <input
              className="dialog__input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="dialog__label">
            Sandi proxy
            <input
              className="dialog__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        <label className="dialog__label">
          User-Agent
          <input
            className="dialog__input"
            placeholder="Kosongkan untuk memakai bawaan"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
          />
        </label>

        <div className="dialog__presets">
          {UA_PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="page__action"
              onClick={() => setUserAgent(preset.value ?? '')}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="dialog__note">
          Catatan: mengubah User-Agent hanya mengganti header. Client Hints
          (<code>sec-ch-ua</code>) tetap melaporkan Chromium yang sebenarnya, jadi ini bukan
          alat anti-fingerprint.
        </p>

        <div className="dialog__actions">
          <button className="page__action" onClick={onClose}>
            Batal
          </button>
          <button className="page__action page__action--primary" disabled={busy} onClick={() => void apply()}>
            Terapkan &amp; muat ulang
          </button>
        </div>
      </div>
    </div>
  )
}
