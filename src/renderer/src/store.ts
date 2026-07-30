import { useSyncExternalStore } from 'react'
import type { AppState } from '@shared/types'

/**
 * State ini cerminan dari main process, bukan sumber kebenaran.
 * Renderer tidak pernah mengubahnya sendiri — semua aksi dikirim lewat IPC dan
 * kembali sebagai snapshot baru. Itu yang membuat UI tidak bisa desinkron.
 */
let state: AppState = {
  tabs: [],
  activeTabId: null,
  mode: 'strip',
  activeDownloads: 0,
  isMaximized: false,
  savePrompt: null,
  credentialCount: 0
}
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function initStore(): void {
  void window.browser.getState().then((initial) => {
    state = initial
    emit()
  })
  window.browser.onStateChanged((next) => {
    state = next
    emit()
  })
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function getSnapshot(): AppState {
  return state
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot)
}
