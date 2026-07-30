import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AppInfo,
  type AppState,
  type ChromeMode,
  type DownloadState,
  type FindResult,
  type ManagerState,
  type ProxyConfig,
  type ResponsiveState,
  type SavedCredential,
  type UpdateState,
  type UiCommand
} from '@shared/types'
import type { TabColorId } from '@shared/colors'
import type { DevicePreset } from '@shared/devices'

/**
 * Jembatan renderer <-> main. Hanya dipasang pada chromeView dan halaman internal;
 * halaman web biasa tidak pernah melihat modul ini.
 */
const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke(IPC.STATE_GET),

  createTab: (url?: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_CREATE, url),
  closeTab: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_CLOSE, id),
  activateTab: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_ACTIVATE, id),
  renameTab: (id: string, title: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_RENAME, id, title),
  setTabColor: (id: string, color: TabColorId | null): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_SET_COLOR, id, color),
  reorderTab: (id: string, toIndex: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_REORDER, id, toIndex),

  goto: (id: string, input: string): Promise<void> => ipcRenderer.invoke(IPC.NAV_GOTO, id, input),
  back: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NAV_BACK, id),
  forward: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NAV_FORWARD, id),
  reload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NAV_RELOAD, id),
  stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NAV_STOP, id),

  toggleDevTools: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DEVTOOLS_TOGGLE, id),
  setChromeMode: (mode: ChromeMode): Promise<void> => ipcRenderer.invoke(IPC.CHROME_SET_MODE, mode),

  openInternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_OPEN_INTERNAL, url),

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.APP_INFO),

  update: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UPD_STATE_GET),
    check: (): Promise<void> => ipcRenderer.invoke(IPC.UPD_CHECK),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.UPD_INSTALL),
    onChanged: (cb: (state: UpdateState) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, state: UpdateState): void => cb(state)
      ipcRenderer.on(IPC.UPD_STATE_CHANGED, listener)
      return () => ipcRenderer.off(IPC.UPD_STATE_CHANGED, listener)
    }
  },
  newWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_NEW),

  // Menu digambar oleh sistem, jadi halaman di bawahnya tidak perlu ditutupi.
  showTabMenu: (id: string, x: number, y: number): Promise<void> =>
    ipcRenderer.invoke(IPC.MENU_TAB, id, x, y),
  /** Window Manager: window pembuka tempat profil dikelola. */
  manager: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.MGR_OPEN),
    getState: (): Promise<ManagerState | null> => ipcRenderer.invoke(IPC.MGR_STATE_GET),
    openProfile: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MGR_OPEN_PROFILE, id),
    closeProfile: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MGR_CLOSE_PROFILE, id),
    createProfile: (name?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MGR_CREATE_PROFILE, name),
    renameProfile: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MGR_RENAME_PROFILE, id, name),
    deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MGR_DELETE_PROFILE, id),
    onChanged: (cb: (state: ManagerState) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, state: ManagerState): void => cb(state)
      ipcRenderer.on(IPC.MGR_STATE_CHANGED, listener)
      return () => ipcRenderer.off(IPC.MGR_STATE_CHANGED, listener)
    }
  },

  openResponsive: (tabId: string): Promise<void> => ipcRenderer.invoke(IPC.RESP_OPEN, tabId),

  credentials: {
    /** Menyetujui tawaran simpan. Sandinya tetap di main, tidak pernah lewat sini. */
    accept: (): Promise<boolean> => ipcRenderer.invoke(IPC.CRED_SAVE_ACCEPT),
    dismiss: (): Promise<void> => ipcRenderer.invoke(IPC.CRED_SAVE_DISMISS),
    never: (): Promise<void> => ipcRenderer.invoke(IPC.CRED_SAVE_NEVER),
    list: (): Promise<SavedCredential[]> => ipcRenderer.invoke(IPC.CRED_LIST),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.CRED_DELETE, id),
    reveal: (id: string): Promise<string | null> => ipcRenderer.invoke(IPC.CRED_REVEAL, id),
    blocked: (): Promise<string[]> => ipcRenderer.invoke(IPC.CRED_BLOCKED),
    unblock: (origin: string): Promise<void> => ipcRenderer.invoke(IPC.CRED_UNBLOCK, origin),
    /** false = enkripsi OS tidak tersedia; menyimpan sandi ditolak. */
    available: (): Promise<boolean> => ipcRenderer.invoke(IPC.CRED_AVAILABLE),
    showMenu: (tabId: string, x: number, y: number): Promise<void> =>
      ipcRenderer.invoke(IPC.MENU_CREDENTIALS, tabId, x, y)
  },

  responsive: {
    getState: (): Promise<ResponsiveState | null> => ipcRenderer.invoke(IPC.RESP_STATE_GET),
    goto: (input: string): Promise<void> => ipcRenderer.invoke(IPC.RESP_GOTO, input),
    reloadAll: (): Promise<void> => ipcRenderer.invoke(IPC.RESP_RELOAD_ALL),
    toggleDevice: (id: string): Promise<void> => ipcRenderer.invoke(IPC.RESP_TOGGLE_DEVICE, id),
    addDevice: (device: DevicePreset): Promise<void> =>
      ipcRenderer.invoke(IPC.RESP_ADD_DEVICE, device),
    removeDevice: (id: string): Promise<void> => ipcRenderer.invoke(IPC.RESP_REMOVE_DEVICE, id),
    setScroll: (x: number): Promise<void> => ipcRenderer.invoke(IPC.RESP_SET_SCROLL, x),
    setZoom: (zoom: number): Promise<void> => ipcRenderer.invoke(IPC.RESP_SET_ZOOM, zoom),
    setSync: (enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC.RESP_SET_SYNC, enabled),
    setOverlay: (overlay: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.RESP_SET_OVERLAY, overlay),
    onChanged: (cb: (state: ResponsiveState) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, state: ResponsiveState): void => cb(state)
      ipcRenderer.on(IPC.RESP_STATE_CHANGED, listener)
      return () => ipcRenderer.off(IPC.RESP_STATE_CHANGED, listener)
    }
  },

  minimizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE_TOGGLE),
  closeWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

  setProxy: (id: string, proxy: ProxyConfig | null): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_SET_PROXY, id, proxy),
  setUserAgent: (id: string, ua: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_SET_USER_AGENT, id, ua),

  getDownloads: (): Promise<DownloadState[]> => ipcRenderer.invoke(IPC.DOWNLOADS_GET),
  cancelDownload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOADS_CANCEL, id),
  openDownload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOADS_OPEN, id),
  showDownload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOADS_SHOW, id),
  clearDownloads: (): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOADS_CLEAR),

  onDownloadsChanged: (cb: (items: DownloadState[]) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, items: DownloadState[]): void => cb(items)
    ipcRenderer.on(IPC.DOWNLOADS_CHANGED, listener)
    return () => ipcRenderer.off(IPC.DOWNLOADS_CHANGED, listener)
  },

  find: (id: string, text: string, findNext = false): Promise<void> =>
    ipcRenderer.invoke(IPC.FIND_START, id, text, findNext),
  stopFind: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FIND_STOP, id),

  onFindResult: (cb: (result: FindResult) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, result: FindResult): void => cb(result)
    ipcRenderer.on(IPC.FIND_RESULT, listener)
    return () => ipcRenderer.off(IPC.FIND_RESULT, listener)
  },

  /** Berlangganan snapshot state. Mengembalikan fungsi untuk berhenti berlangganan. */
  onStateChanged: (cb: (state: AppState) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, state: AppState): void => cb(state)
    ipcRenderer.on(IPC.STATE_CHANGED, listener)
    return () => ipcRenderer.off(IPC.STATE_CHANGED, listener)
  },

  /** Perintah UI yang dipicu shortcut keyboard yang ditangkap main process. */
  onCommand: (cb: (command: UiCommand) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, command: UiCommand): void => cb(command)
    ipcRenderer.on(IPC.UI_COMMAND, listener)
    return () => ipcRenderer.off(IPC.UI_COMMAND, listener)
  }
}

export type BrowserAPI = typeof api

contextBridge.exposeInMainWorld('browser', api)
