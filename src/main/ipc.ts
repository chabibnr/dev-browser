import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC,
  INTERNAL_DOWNLOADS,
  INTERNAL_PASSWORDS,
  displayTitle,
  type AppInfo,
  type ChromeMode,
  type ProxyConfig
} from '@shared/types'
import { isTabColorId } from '@shared/colors'
import { isValidDevice } from '@shared/devices'
import type { DownloadManager } from './downloads'
import type { BrowserContext } from './browser-context'
import { contextFor, contextForProfile } from './browser-registry'
import { createProfile, deleteProfile, renameProfile } from './profiles'
import { check as checkForUpdates, installNow as installUpdate, updateState } from './updater'
import { controlsFor } from './window-registry'
import { getSession } from './session-store'
import { openResponsive, responsiveWindow } from './responsive'
import { popupCredentialMenu, popupTabMenu } from './menus'
import { fillById, originOf } from './autofill'
import {
  blockOrigin,
  blockedOrigins,
  credentialsFor,
  deleteCredential,
  getPassword,
  isVaultAvailable,
  listCredentials,
  saveCredential,
  unblockOrigin
} from './credentials'

/**
 * Seluruh permukaan IPC ada di sini.
 *
 * Hanya chromeView (UI kita sendiri) yang punya preload, jadi tidak ada halaman
 * web yang bisa memanggil channel ini. Meski begitu setiap handler tetap
 * memvalidasi argumennya, supaya bug di UI tidak berubah menjadi crash di main.
 *
 * Window sasaran ditentukan dari webContents pengirim, bukan ditutup di dalam
 * closure — dengan begitu satu set handler melayani berapa pun jumlah window.
 */
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Handler window uji responsif. Diam saja bila window-nya sedang tidak terbuka. */
function registerResponsiveIpc(): void {
  const win = (): ReturnType<typeof responsiveWindow> => responsiveWindow()

  ipcMain.handle(IPC.RESP_STATE_GET, () => win()?.getState() ?? null)
  ipcMain.handle(IPC.RESP_RELOAD_ALL, () => win()?.reloadAll())

  ipcMain.handle(IPC.RESP_GOTO, (_e, input: unknown) => {
    const text = asString(input)
    if (text !== null) win()?.navigate(text)
  })

  ipcMain.handle(IPC.RESP_TOGGLE_DEVICE, (_e, id: unknown) => {
    const deviceId = asString(id)
    if (deviceId) win()?.toggleDevice(deviceId)
  })

  ipcMain.handle(IPC.RESP_ADD_DEVICE, (_e, device: unknown) => {
    // Ukuran dan bentuk divalidasi di sini, bukan dipercaya dari UI: device cacat
    // akan tersimpan permanen ke disk dan merusak window pada pembukaan berikutnya.
    if (isValidDevice(device)) win()?.addDevice({ ...device, builtIn: false })
  })

  ipcMain.handle(IPC.RESP_REMOVE_DEVICE, (_e, id: unknown) => {
    const deviceId = asString(id)
    if (deviceId) win()?.removeDevice(deviceId)
  })

  ipcMain.handle(IPC.RESP_SET_SCROLL, (_e, y: unknown) => {
    if (typeof y === 'number' && Number.isFinite(y)) win()?.setScroll(y)
  })

  ipcMain.handle(IPC.RESP_SET_ZOOM, (_e, zoom: unknown) => {
    if (typeof zoom === 'number' && Number.isFinite(zoom)) win()?.setZoom(zoom)
  })

  ipcMain.handle(IPC.RESP_SET_SYNC, (_e, enabled: unknown) => win()?.setSync(enabled === true))
  ipcMain.handle(IPC.RESP_SET_OVERLAY, (_e, overlay: unknown) => win()?.setOverlay(overlay === true))
}

export interface AppHooks {
  onNewWindow(): void
  openManager(): void
  openProfile(id: string): void
  managerState(): unknown
  notifyManager(): void
}

export function registerIpc(downloads: DownloadManager, hooks: AppHooks): void {
  /** Window asal permintaan. Semua handler tab bergantung pada ini. */
  const ctx = (e: IpcMainInvokeEvent): BrowserContext | null => contextFor(e.sender.id)

  ipcMain.handle(IPC.STATE_GET, (e) => ctx(e)?.tm.getState() ?? null)

  ipcMain.handle(IPC.TAB_CREATE, (e, url?: unknown) => {
    ctx(e)?.tm.create(asString(url) ?? 'about:blank')
  })

  ipcMain.handle(IPC.TAB_CLOSE, (e, id: unknown) => {
    const tabId = asString(id)
    if (tabId) ctx(e)?.tm.close(tabId)
  })

  ipcMain.handle(IPC.TAB_ACTIVATE, (e, id: unknown) => {
    const tabId = asString(id)
    if (tabId) ctx(e)?.tm.activate(tabId)
  })

  ipcMain.handle(IPC.TAB_RENAME, (e, id: unknown, title: unknown) => {
    const tabId = asString(id)
    if (tabId) ctx(e)?.tm.rename(tabId, typeof title === 'string' ? title : null)
  })

  ipcMain.handle(IPC.TAB_REORDER, (e, id: unknown, toIndex: unknown) => {
    const tabId = asString(id)
    if (tabId && typeof toIndex === 'number' && Number.isInteger(toIndex)) {
      ctx(e)?.tm.reorder(tabId, toIndex)
    }
  })

  ipcMain.handle(IPC.NAV_GOTO, (e, id: unknown, input: unknown) => {
    const tabId = asString(id)
    const text = asString(input)
    if (tabId && text !== null) ctx(e)?.tm.navigate(tabId, text)
  })

  ipcMain.handle(IPC.NAV_BACK, (e, id: unknown) => ctx(e)?.tm.find(asString(id) ?? '')?.goBack())
  ipcMain.handle(IPC.NAV_FORWARD, (e, id: unknown) =>
    ctx(e)?.tm.find(asString(id) ?? '')?.goForward()
  )
  ipcMain.handle(IPC.NAV_RELOAD, (e, id: unknown) => ctx(e)?.tm.find(asString(id) ?? '')?.reload())
  ipcMain.handle(IPC.NAV_STOP, (e, id: unknown) => ctx(e)?.tm.find(asString(id) ?? '')?.stop())

  ipcMain.handle(IPC.DEVTOOLS_TOGGLE, (e, id: unknown) => {
    ctx(e)?.tm.find(asString(id) ?? '')?.toggleDevTools()
  })

  ipcMain.handle(IPC.FIND_START, (e, id: unknown, text: unknown, findNext: unknown) => {
    const tabId = asString(id)
    const query = asString(text)
    if (tabId && query !== null) {
      ctx(e)?.tm.find(tabId)?.find(query, { findNext: findNext === true, forward: true })
    }
  })

  ipcMain.handle(IPC.FIND_STOP, (e, id: unknown) => {
    ctx(e)?.tm.find(asString(id) ?? '')?.stopFind()
  })

  ipcMain.handle(IPC.TAB_OPEN_INTERNAL, (e, url: unknown) => {
    // Hanya halaman internal yang dikenal — bukan URL sembarangan dari renderer.
    if (url === INTERNAL_DOWNLOADS || url === INTERNAL_PASSWORDS) {
      ctx(e)?.tm.openInternal(url as string)
    }
  })

  // ------------------------------------------------------------- kredensial

  ipcMain.handle(IPC.CRED_AVAILABLE, () => isVaultAvailable())
  ipcMain.handle(IPC.CRED_LIST, () => listCredentials())
  ipcMain.handle(IPC.CRED_BLOCKED, () => blockedOrigins())

  ipcMain.handle(IPC.CRED_DELETE, (_e, id: unknown) => {
    const credId = asString(id)
    if (credId) deleteCredential(credId)
  })

  ipcMain.handle(IPC.CRED_UNBLOCK, (_e, origin: unknown) => {
    const value = asString(origin)
    if (value) unblockOrigin(value)
  })

  // Satu-satunya jalur sandi keluar ke UI, dan hanya untuk halaman pengelola
  // milik kita sendiri saat pengguna menekan "lihat".
  ipcMain.handle(IPC.CRED_REVEAL, async (_e, id: unknown) => {
    const credId = asString(id)
    return credId ? await getPassword(credId) : null
  })

  const clearPrompt = (context: BrowserContext): void => {
    context.tm.savePrompt = null
    if (context.shell.getMode() === 'strip-save') context.shell.setMode('strip')
    context.tm.notify()
  }

  ipcMain.handle(IPC.CRED_SAVE_ACCEPT, async (e) => {
    const context = ctx(e)
    const prompt = context?.tm.savePrompt
    if (!context || !prompt) return false
    const saved = await saveCredential(prompt.origin, prompt.username, prompt.password)
    clearPrompt(context)
    return saved
  })

  ipcMain.handle(IPC.CRED_SAVE_DISMISS, (e) => {
    const context = ctx(e)
    if (context) clearPrompt(context)
  })

  ipcMain.handle(IPC.CRED_SAVE_NEVER, (e) => {
    const context = ctx(e)
    const prompt = context?.tm.savePrompt
    if (!context || !prompt) return
    blockOrigin(prompt.origin)
    clearPrompt(context)
  })

  ipcMain.handle(IPC.MENU_CREDENTIALS, (e, id: unknown, x: unknown, y: unknown) => {
    const context = ctx(e)
    const tabId = asString(id)
    if (!context || !tabId || typeof x !== 'number' || typeof y !== 'number') return

    const wc = context.tm.find(tabId)?.currentView?.webContents
    if (!wc) return
    const origin = originOf(wc)

    popupCredentialMenu(
      context.shell.window,
      origin ? credentialsFor(origin) : [],
      { x, y },
      (credId) => void fillById(wc, credId),
      () => context.tm.openInternal(INTERNAL_PASSWORDS)
    )
  })

  ipcMain.handle(IPC.TAB_SET_COLOR, (e, id: unknown, color: unknown) => {
    const tm = ctx(e)?.tm
    const tabId = asString(id)
    if (!tm || !tabId) return
    // null = kembali ke warna bawaan; id di luar palet diabaikan.
    if (color === null) tm.setColor(tabId, null)
    else if (isTabColorId(color)) tm.setColor(tabId, color)
  })

  ipcMain.handle(IPC.TAB_SET_PROXY, async (e, id: unknown, proxy: unknown) => {
    const tab = ctx(e)?.tm.find(asString(id) ?? '')
    if (!tab) return
    if (proxy === null) {
      await tab.setProxy(null)
      return
    }
    const candidate = proxy as Partial<ProxyConfig>
    if (typeof candidate?.rules !== 'string' || candidate.rules.trim() === '') return
    await tab.setProxy({
      rules: candidate.rules.trim(),
      bypass: typeof candidate.bypass === 'string' ? candidate.bypass : undefined,
      username: typeof candidate.username === 'string' ? candidate.username : undefined,
      password: typeof candidate.password === 'string' ? candidate.password : undefined
    })
  })

  ipcMain.handle(IPC.TAB_SET_USER_AGENT, (e, id: unknown, ua: unknown) => {
    const tab = ctx(e)?.tm.find(asString(id) ?? '')
    if (!tab) return
    const value = asString(ua)
    tab.setUserAgent(value && value.trim() !== '' ? value.trim() : null)
  })

  // ------------------------------------------------------------ menu native

  ipcMain.handle(IPC.MENU_TAB, (e, id: unknown, x: unknown, y: unknown) => {
    const context = ctx(e)
    const tabId = asString(id)
    if (!context || !tabId || typeof x !== 'number' || typeof y !== 'number') return

    const tab = context.tm.find(tabId)
    if (!tab) return
    context.tm.activate(tabId)

    popupTabMenu(context.shell.window, tab.color, { x, y }, {
      onRename: () => context.tm.sendCommand({ type: 'startRename', tabId }),
      onSetColor: (color) => context.tm.setColor(tabId, color),
      onReload: () => context.tm.find(tabId)?.reload(),
      onClose: () => context.tm.close(tabId)
    })
  })

  // ---------------------------------------------------------- Window Manager

  ipcMain.handle(IPC.UPD_STATE_GET, () => updateState())
  ipcMain.handle(IPC.UPD_CHECK, () => checkForUpdates())
  ipcMain.handle(IPC.UPD_INSTALL, () => installUpdate())

  ipcMain.handle(IPC.MGR_OPEN, () => hooks.openManager())
  ipcMain.handle(IPC.MGR_STATE_GET, () => hooks.managerState())

  ipcMain.handle(IPC.MGR_OPEN_PROFILE, (_e, id: unknown) => {
    const profileId = asString(id)
    if (profileId) hooks.openProfile(profileId)
  })

  ipcMain.handle(IPC.MGR_CLOSE_PROFILE, (_e, id: unknown) => {
    const profileId = asString(id)
    if (profileId) contextForProfile(profileId)?.shell.close()
  })

  ipcMain.handle(IPC.MGR_CREATE_PROFILE, (_e, name: unknown) => {
    const profile = createProfile(asString(name) ?? undefined)
    hooks.openProfile(profile.id)
  })

  ipcMain.handle(IPC.MGR_RENAME_PROFILE, (_e, id: unknown, name: unknown) => {
    const profileId = asString(id)
    const value = asString(name)
    if (profileId && value) {
      renameProfile(profileId, value)
      hooks.notifyManager()
    }
  })

  ipcMain.handle(IPC.MGR_DELETE_PROFILE, (_e, id: unknown) => {
    const profileId = asString(id)
    if (!profileId) return
    // Window yang sedang terbuka ditutup dulu; kalau tidak, ia akan menyimpan
    // tabnya kembali ke profil yang baru saja dihapus dan menghidupkannya lagi.
    contextForProfile(profileId)?.shell.close()
    deleteProfile(profileId)
    hooks.notifyManager()
  })

  // ------------------------------------------------------------- lain-lain

  ipcMain.handle(IPC.DOWNLOADS_GET, () => downloads.list())
  ipcMain.handle(IPC.DOWNLOADS_CANCEL, (_e, id: unknown) => {
    const downloadId = asString(id)
    if (downloadId) downloads.cancel(downloadId)
  })
  ipcMain.handle(IPC.DOWNLOADS_OPEN, async (_e, id: unknown) => {
    const downloadId = asString(id)
    if (downloadId) await downloads.openFile(downloadId)
  })
  ipcMain.handle(IPC.DOWNLOADS_SHOW, (_e, id: unknown) => {
    const downloadId = asString(id)
    if (downloadId) downloads.showInFolder(downloadId)
  })
  ipcMain.handle(IPC.DOWNLOADS_CLEAR, () => downloads.clearFinished())

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => controlsFor(e.sender.id)?.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE_TOGGLE, (e) => controlsFor(e.sender.id)?.toggleMaximize())
  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => controlsFor(e.sender.id)?.close())
  ipcMain.handle(IPC.WINDOW_NEW, () => hooks.onNewWindow())

  ipcMain.handle(
    IPC.APP_INFO,
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    })
  )

  ipcMain.handle(IPC.RESP_OPEN, (e, id: unknown) => {
    const context = ctx(e)
    const tab = context?.tm.find(asString(id) ?? '') ?? context?.tm.active
    if (!tab) return
    openResponsive(tab.url, getSession(tab.sessionId), displayTitle(tab.toState()))
  })

  ipcMain.handle(IPC.CHROME_SET_MODE, (e, mode: unknown) => {
    const context = ctx(e)
    const valid: ChromeMode[] = ['strip', 'strip-find', 'overlay']
    if (!context || typeof mode !== 'string' || !valid.includes(mode as ChromeMode)) return

    context.shell.setMode(mode as ChromeMode)
    // Keluar dari overlay mengembalikan fokus ke halaman, seperti menutup menu.
    if (mode === 'strip') context.shell.focusPage()
    context.tm.notify()
  })

  registerResponsiveIpc()
}
