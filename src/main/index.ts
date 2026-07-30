import { app } from 'electron'
import path from 'node:path'
import { IPC } from '@shared/types'
import { BrowserContext } from './browser-context'
import {
  addContext,
  allContexts,
  contextForProfile,
  firstContext,
  removeContext
} from './browser-registry'
import { DownloadManager } from './downloads'
import { registerIpc } from './ipc'
import { ManagerWindow } from './manager-window'
import { flushState, loadState, saveState, type PersistedState } from './persistence'
import {
  allProfiles,
  createProfile,
  findProfile,
  initProfiles,
  markOpened,
  referencedSessionIds,
  updateProfileTabs
} from './profiles'
import {
  getSession,
  liveSessions,
  purgePendingDeletes,
  reportOrphanSessions
} from './session-store'
import { openResponsive, responsiveWindow } from './responsive'
import { setManagerOpener } from './manager-bridge'
import { createTray, destroyTray, hasTray } from './tray'
import { check as checkForUpdates, initUpdater, updateState } from './updater'
import { deleteCredential, isVaultAvailable, listCredentials, saveCredential } from './credentials'

// Folder data dipatok eksplisit supaya sama persis antara mode dev dan aplikasi
// terpasang. Tanpa ini, versi terpasang memakai productName dan datanya terpisah.
// BROWSER_USER_DATA dipakai test agar tidak mengotori profil asli pengguna.
//
// Namanya sengaja TETAP "my-dev-browser" walau aplikasinya sudah berganti nama,
// appId, dan pemilik repo. Nama folder ini bukan identitas — ia alamat data.
// Menggantinya berarti seluruh profil, sesi login, dan sandi tersimpan milik
// pengguna lama menjadi tak terjangkau tanpa memberi keuntungan apa pun.
app.setPath(
  'userData',
  process.env['BROWSER_USER_DATA'] || path.join(app.getPath('appData'), 'my-dev-browser')
)

// Satu instance saja: dua proses yang menulis folder sesi yang sama akan merusaknya.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

async function start(): Promise<void> {
  await app.whenReady()

  // WAJIB sebelum sesi apa pun dibuat — setelah itu foldernya terkunci lagi.
  purgePendingDeletes()

  const persisted = loadState()

  /**
   * Dikunci setelah state terakhir tersimpan, supaya penyimpanan yang terjadi
   * saat aplikasi sedang dibongkar tidak menimpa state yang bagus.
   */
  let finalized = false

  const snapshot = (): PersistedState => ({ version: 2, profiles: [...allProfiles()] })

  const persistSoon = (): void => {
    if (!finalized) saveState(snapshot())
  }

  /**
   * Mencerminkan tab semua window yang hidup ke profilnya masing-masing.
   *
   * WAJIB dijalankan sebelum menyimpan: snapshot dibaca dari penyimpan profil,
   * bukan langsung dari TabManager, sehingga perubahan terakhir (mis. rename
   * tepat sebelum keluar) belum tentu sudah sampai ke sana.
   */
  const syncLiveProfiles = (): void => {
    for (const context of allContexts()) {
      const shot = context.snapshot()
      updateProfileTabs(context.profileId, shot.tabs, shot.activeTabId)
    }
  }

  const persistNow = (): void => {
    if (finalized) return
    syncLiveProfiles()
    saveState(snapshot())
    flushState()
  }

  let manager: ManagerWindow | null = null

  /** Profil berubah: simpan ke disk dan segarkan daftar di Window Manager. */
  const profilesChanged = (): void => {
    persistSoon()
    manager?.notify()
  }

  initProfiles(persisted?.profiles ? [...persisted.profiles] : [], profilesChanged)

  // Sesi yang tidak dirujuk profil mana pun hanya dicatat, tidak dihapus. Lihat
  // reportOrphanSessions() untuk alasannya.
  reportOrphanSessions(referencedSessionIds())

  const downloads = new DownloadManager(
    (sessionId) => {
      for (const context of allContexts()) {
        const label = context.tm.labelForSession(sessionId)
        if (label) return label
      }
      return 'Tab yang sudah ditutup'
    },
    () => {
      for (const context of allContexts()) {
        context.tm.broadcast(IPC.DOWNLOADS_CHANGED, downloads.list())
        context.tm.notify() // memperbarui badge di toolbar
      }
    }
  )

  /**
   * Membuka profil sebagai window. Profil yang sudah terbuka hanya difokuskan —
   * dua window atas satu profil akan saling menimpa tabnya.
   */
  function openProfile(profileId: string): BrowserContext | null {
    const existing = contextForProfile(profileId)
    if (existing) {
      existing.focus()
      return existing
    }

    const profile = findProfile(profileId)
    if (!profile) return null

    const context = new BrowserContext(profileId, profile, {
      onPersist: () => {
        // Tab yang sedang hidup langsung dicerminkan ke profilnya, sehingga
        // state di disk selalu mewakili apa yang terbuka.
        const shot = context.snapshot()
        updateProfileTabs(profileId, shot.tabs, shot.activeTabId)
      },
      onNewWindow: () => openProfile(createProfile().id),
      onClosed: (closed) => {
        // Menutup window TIDAK menghapus profilnya — itu inti Window Manager.
        // Tabnya disimpan dulu, baru window-nya dilepas dari daftar.
        const shot = closed.snapshot()
        updateProfileTabs(profileId, shot.tabs, shot.activeTabId)
        removeContext(closed)
        persistNow()
        manager?.notify()
      }
    })

    context.tm.getDownloadCount = () => downloads.activeCount()
    addContext(context)
    markOpened(profileId)
    manager?.notify()
    return context
  }

  setManagerOpener(() => openManager())

  function openManager(): ManagerWindow {
    if (manager) {
      manager.focus()
      return manager
    }
    manager = new ManagerWindow(() => {
      manager = null
    })
    return manager
  }

  registerIpc(downloads, {
    onNewWindow: () => void openProfile(createProfile().id),
    openManager: () => void openManager(),
    openProfile: (id) => void openProfile(id),
    managerState: () => manager?.getState() ?? null,
    notifyManager: () => manager?.notify()
  })

  // Window Manager adalah window pembuka: pengguna memilih profil mana yang
  // dibuka, alih-alih aplikasi menebaknya.
  openManager()

  createTray({
    // openManager() sudah memfokuskan window yang ada, dan yang baru dibuat akan
    // muncul sendiri setelah UI-nya selesai dimuat — memanggil focus() di sini
    // hanya akan memperlihatkan window kosong sekejap.
    showManager: () => void openManager(),
    openProfile: (id) => void openProfile(id)
  })

  app.on('will-quit', () => destroyTray())

  // Pembaruan diperiksa sekali saat start; hasilnya hanya dilaporkan ke dialog
  // Tentang, tidak pernah memaksa apa pun.
  initUpdater((state) => manager?.notifyUpdate(state))

  app.on('second-instance', () => (manager ? manager.focus() : firstContext()?.focus()))

  // Kait untuk test otomatis; tidak pernah aktif saat dipakai normal.
  if (process.env['BROWSER_TEST_HOOKS']) {
    ;(globalThis as unknown as { __browser: unknown }).__browser = {
      // tm & shell menunjuk window browser pertama yang terbuka, supaya test
      // lama tetap berlaku setelah profil diperkenalkan.
      get tm() {
        return firstContext()?.tm
      },
      get shell() {
        return firstContext()?.shell
      },
      get manager() {
        return manager
      },
      /** Window Manager yang terbuka saat start, jadi test perlu ini dulu. */
      ensureWindow: () => firstContext() ?? openProfile(allProfiles()[0]!.id),
      hasTray,
      allContexts,
      allProfiles,
      createProfile,
      openProfile,
      openManager,
      createWindow: () => openProfile(createProfile().id),
      openResponsive,
      responsiveWindow,
      getSession,
      updateState,
      checkUpdate: checkForUpdates,
      credentials: { saveCredential, listCredentials, isVaultAvailable, deleteCredential }
    }
  }

  // Kredensial proxy TIDAK bisa dititipkan lewat "user:pass@host" di proxyRules —
  // Chromium mengabaikannya. Satu-satunya jalur adalah event ini.
  app.on('login', (event, webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy) return // autentikasi situs biasa dibiarkan ke halaman

    for (const context of allContexts()) {
      const tab = context.tm.all.find((t) => t.currentView?.webContents === webContents)
      if (!tab?.proxy?.username) continue
      event.preventDefault()
      callback(tab.proxy.username, tab.proxy.password ?? '')
      return
    }
  })

  /*
   * Chromium menulis cookie ke disk secara tertunda. Kalau aplikasi ditutup tak
   * lama setelah login, cookie itu belum sempat tersimpan dan sesinya hilang —
   * padahal justru itu yang dijanjikan aplikasi ini.
   */
  let flushing = false
  app.on('before-quit', (event) => {
    persistNow()
    finalized = true
    if (flushing) return

    flushing = true
    event.preventDefault()

    // Dibatasi waktunya: menahan keluar demi pembilasan boleh, menggantung
    // selamanya karena satu sesi tidak merespons tidak boleh.
    //
    // Tiap panggilan dibungkus Promise.resolve().then(): flushStore() pada sesi
    // yang sudah dibongkar bisa melempar SEBELUM mengembalikan promise, dan
    // lemparan itu akan melewati allSettled — `.finally` tidak pernah jalan dan
    // aplikasi menggantung selamanya tanpa pernah keluar.
    const flushed = Promise.allSettled(
      liveSessions().map((ses) => Promise.resolve().then(() => ses.cookies.flushStore()))
    )
    const deadline = new Promise((resolve) => setTimeout(resolve, 3000))
    void Promise.race([flushed, deadline]).finally(() => app.quit())
  })

  app.on('window-all-closed', () => app.quit())
}
