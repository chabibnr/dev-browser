/** Tinggi bilah chrome (tab strip + toolbar) dalam mode normal. */
export const TOPBAR_HEIGHT = 88
/** Tambahan tinggi saat find bar terbuka. */
export const FINDBAR_HEIGHT = 40
/** Tambahan tinggi saat tawaran menyimpan sandi muncul. */
export const SAVEBAR_HEIGHT = 44

/**
 * Mode layout chromeView.
 * - `strip`      : hanya bilah atas, halaman interaktif di bawahnya
 * - `strip-find` : bilah atas + find bar, halaman digeser turun
 * - `strip-save` : bilah atas + tawaran menyimpan sandi
 * - `overlay`    : chromeView menutupi seluruh window (menu / dialog)
 */
export type ChromeMode = 'strip' | 'strip-find' | 'strip-save' | 'overlay'

export interface ProxyConfig {
  /** Format Chromium, mis. "http://127.0.0.1:8080" atau "socks5://127.0.0.1:1080" */
  rules: string
  /** Daftar bypass dipisah koma, mis. "localhost,127.0.0.1,<local>" */
  bypass?: string
  username?: string
  password?: string
}

export interface TabState {
  id: string
  /** Folder sesi yang dipakai tab ini. Sama dengan `id`, kecuali tab warisan popup. */
  sessionId: string
  url: string
  /** Judul dari <title> halaman. */
  pageTitle: string
  /** Nama yang diberikan pengguna. Bila terisi, ini yang ditampilkan. */
  customTitle: string | null
  /** Warna pilihan pengguna; ikut mewarnai toolbar saat tab ini aktif. */
  color: TabColorId | null
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Halaman internal (mis. browser://downloads) — tidak punya sesi sendiri. */
  isInternal: boolean
  /** false = tab hasil restore yang belum pernah diaktifkan (view belum dibuat). */
  isLoaded: boolean
  proxy: ProxyConfig | null
  userAgent: string | null
}

export interface AppState {
  tabs: TabState[]
  activeTabId: string | null
  mode: ChromeMode
  /** Jumlah unduhan berjalan, untuk badge di toolbar. */
  activeDownloads: number
  /** Window frameless: UI yang menggambar tombol maximize/restore. */
  isMaximized: boolean
  /** Tawaran menyimpan sandi yang sedang menunggu jawaban. */
  savePrompt: SavePromptState | null
  /** Jumlah kredensial tersimpan untuk origin tab aktif; menyalakan tombol kunci. */
  credentialCount: number
}

/** Alamat halaman internal yang dirender oleh bundle renderer, bukan web. */
export const INTERNAL_DOWNLOADS = 'browser://downloads'
export const INTERNAL_PASSWORDS = 'browser://passwords'

import type { TabColorId } from './colors'
import type { DevicePreset } from './devices'

/** Posisi & ukuran satu viewport, dihitung main dan digambar ulang oleh UI. */
export interface ViewportRect {
  deviceId: string
  name: string
  deviceWidth: number
  deviceHeight: number
  x: number
  y: number
  width: number
  height: number
  scale: number
}

export interface ResponsiveState {
  url: string
  /** Preset bawaan + buatan pengguna. */
  devices: DevicePreset[]
  /** Id device yang sedang ditampilkan, sesuai urutannya di baris. */
  selected: string[]
  rects: ViewportRect[]
  /** Gulir tegak: baris device membungkus ke bawah saat tidak muat. */
  scrollY: number
  maxScrollY: number
  zoom: number
  syncEnabled: boolean
  isMaximized: boolean
  /** Nama tab yang sesinya dipakai — semua viewport ikut login tab itu. */
  sessionLabel: string
}

/** Metadata kredensial. Sandinya TIDAK pernah dikirim ke renderer. */
export interface SavedCredential {
  id: string
  origin: string
  username: string
  createdAt: number
  updatedAt: number
}

/** Tawaran menyimpan sandi setelah pengguna mengirim form login. */
export interface SavePromptState {
  origin: string
  username: string
}

/** Satu baris di Window Manager. */
export interface ManagerProfile {
  id: string
  name: string
  tabCount: number
  /** Window-nya sedang terbuka. */
  isOpen: boolean
  lastOpenedAt: number | null
  /** Nama beberapa tab pertama, untuk pratinjau isi profil. */
  preview: string[]
}

export interface ManagerState {
  profiles: ManagerProfile[]
  isMaximized: boolean
}

/** Keadaan pembaruan otomatis, ditampilkan di dialog Tentang. */
export interface UpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error' | 'unsupported'
  version: string | null
  percent: number
  message: string | null
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
}

export type DownloadStatus = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadState {
  id: string
  filename: string
  url: string
  savePath: string
  status: DownloadStatus
  receivedBytes: number
  totalBytes: number
  /** Sesi asal unduhan — menunjukkan "akun" mana yang mengunduhnya. */
  sessionId: string
  /** Nama tab asal saat unduhan dimulai; tab bisa saja sudah ditutup. */
  originLabel: string
  startedAt: number
}

export interface FindResult {
  tabId: string
  /** Urutan kecocokan yang sedang disorot, mulai dari 1. */
  activeMatchOrdinal: number
  matches: number
}

/** Label yang ditampilkan di tab strip. Rename selalu menang atas judul halaman. */
export function displayTitle(tab: TabState): string {
  const custom = tab.customTitle?.trim()
  if (custom) return custom
  const page = tab.pageTitle?.trim()
  if (page) return page
  return tab.url && tab.url !== 'about:blank' ? tab.url : 'Tab baru'
}

/** Perintah dari main ke UI, dipicu shortcut keyboard yang ditangkap di main process. */
export type UiCommand =
  | { type: 'focusAddressBar' }
  | { type: 'startRename'; tabId: string }
  | { type: 'openFind' }
  | { type: 'closeFind' }
  | { type: 'openAbout' }

export const IPC = {
  // renderer -> main (invoke)
  STATE_GET: 'state:get',
  TAB_CREATE: 'tabs:create',
  TAB_CLOSE: 'tabs:close',
  TAB_ACTIVATE: 'tabs:activate',
  TAB_RENAME: 'tabs:rename',
  TAB_REORDER: 'tabs:reorder',
  NAV_GOTO: 'nav:goto',
  NAV_BACK: 'nav:back',
  NAV_FORWARD: 'nav:forward',
  NAV_RELOAD: 'nav:reload',
  NAV_STOP: 'nav:stop',
  CHROME_SET_MODE: 'chrome:setMode',
  DEVTOOLS_TOGGLE: 'devtools:toggle',
  FIND_START: 'find:start',
  FIND_STOP: 'find:stop',
  TAB_OPEN_INTERNAL: 'tabs:openInternal',
  TAB_SET_COLOR: 'tabs:setColor',
  TAB_SET_PROXY: 'tabs:setProxy',
  TAB_SET_USER_AGENT: 'tabs:setUserAgent',
  DOWNLOADS_GET: 'downloads:get',
  DOWNLOADS_CANCEL: 'downloads:cancel',
  DOWNLOADS_OPEN: 'downloads:open',
  DOWNLOADS_SHOW: 'downloads:show',
  DOWNLOADS_CLEAR: 'downloads:clear',
  // Kontrol window berlaku untuk window mana pun; sasarannya ditentukan dari
  // webContents pengirim, bukan channel terpisah per window.
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'window:maximizeToggle',
  WINDOW_CLOSE: 'window:close',
  WINDOW_NEW: 'window:new',
  // Menu konteks digambar oleh sistem, bukan HTML — lihat src/main/menus.ts.
  MENU_TAB: 'menu:tab',
  MGR_OPEN: 'mgr:open',
  MGR_STATE_GET: 'mgr:state',
  MGR_STATE_CHANGED: 'mgr:changed',
  MGR_OPEN_PROFILE: 'mgr:openProfile',
  MGR_CLOSE_PROFILE: 'mgr:closeProfile',
  MGR_CREATE_PROFILE: 'mgr:createProfile',
  MGR_RENAME_PROFILE: 'mgr:renameProfile',
  MGR_DELETE_PROFILE: 'mgr:deleteProfile',
  MENU_CREDENTIALS: 'menu:credentials',
  CRED_SAVE_ACCEPT: 'cred:accept',
  CRED_SAVE_DISMISS: 'cred:dismiss',
  CRED_SAVE_NEVER: 'cred:never',
  CRED_LIST: 'cred:list',
  CRED_DELETE: 'cred:delete',
  CRED_REVEAL: 'cred:reveal',
  CRED_BLOCKED: 'cred:blocked',
  CRED_UNBLOCK: 'cred:unblock',
  CRED_AVAILABLE: 'cred:available',

  APP_INFO: 'app:info',
  UPD_STATE_GET: 'update:state',
  UPD_CHECK: 'update:check',
  UPD_INSTALL: 'update:install',
  UPD_STATE_CHANGED: 'update:changed',
  RESP_OPEN: 'responsive:open',
  RESP_STATE_GET: 'responsive:state',
  RESP_GOTO: 'responsive:goto',
  RESP_RELOAD_ALL: 'responsive:reloadAll',
  RESP_TOGGLE_DEVICE: 'responsive:toggleDevice',
  RESP_ADD_DEVICE: 'responsive:addDevice',
  RESP_REMOVE_DEVICE: 'responsive:removeDevice',
  RESP_SET_SCROLL: 'responsive:setScroll',
  RESP_SET_ZOOM: 'responsive:setZoom',
  RESP_SET_SYNC: 'responsive:setSync',
  RESP_SET_OVERLAY: 'responsive:setOverlay',
  RESP_STATE_CHANGED: 'responsive:changed',

  // main -> renderer (send)
  STATE_CHANGED: 'state:changed',
  UI_COMMAND: 'ui:command',
  FIND_RESULT: 'find:result',
  DOWNLOADS_CHANGED: 'downloads:changed'
} as const
