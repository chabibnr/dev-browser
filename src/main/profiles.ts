import { randomUUID } from 'node:crypto'
import type { PersistedProfile } from './persistence'

/**
 * Daftar profil window, sumber kebenaran tunggal untuk "window apa saja yang
 * pernah ada".
 *
 * Profil hidup terlepas dari window-nya: menutup window hanya menyimpan tabnya
 * kembali ke profil, tidak membuang profilnya. Dulu window yang ditutup langsung
 * hilang dari state, sehingga hanya window terakhir yang bisa dibuka lagi.
 */
let profiles: PersistedProfile[] = []
let onChange: () => void = () => {}

export function initProfiles(restored: PersistedProfile[], notify: () => void): void {
  profiles = [...restored]
  onChange = notify
  // Daftar kosong hanya terjadi pada pemakaian pertama; sediakan satu profil
  // supaya Window Manager tidak menyambut pengguna dengan halaman hampa.
  if (profiles.length === 0) createProfile('Window 1')
}

export function allProfiles(): readonly PersistedProfile[] {
  return profiles
}

export function findProfile(id: string): PersistedProfile | null {
  return profiles.find((p) => p.id === id) ?? null
}

export function createProfile(name?: string): PersistedProfile {
  const now = Date.now()
  const profile: PersistedProfile = {
    id: randomUUID(),
    name: name?.trim() || nextDefaultName(),
    createdAt: now,
    lastOpenedAt: null,
    activeTabId: null,
    tabs: []
  }
  profiles.push(profile)
  onChange()
  return profile
}

function nextDefaultName(): string {
  // Nomor dicari dari yang belum terpakai, bukan dari jumlah profil — kalau
  // memakai jumlah, menghapus profil di tengah akan menghasilkan nama kembar.
  for (let n = profiles.length + 1; ; n++) {
    const candidate = `Window ${n}`
    if (!profiles.some((p) => p.name === candidate)) return candidate
  }
}

export function renameProfile(id: string, name: string): void {
  const profile = findProfile(id)
  const trimmed = name.trim()
  if (!profile || !trimmed) return
  profile.name = trimmed
  onChange()
}

export function deleteProfile(id: string): void {
  const before = profiles.length
  profiles = profiles.filter((p) => p.id !== id)
  if (profiles.length !== before) onChange()
}

/** Menyimpan isi window yang sedang hidup ke profilnya. */
export function updateProfileTabs(
  id: string,
  tabs: PersistedProfile['tabs'],
  activeTabId: string | null
): void {
  const profile = findProfile(id)
  if (!profile) return
  profile.tabs = tabs
  profile.activeTabId = activeTabId
  onChange()
}

export function markOpened(id: string): void {
  const profile = findProfile(id)
  if (!profile) return
  profile.lastOpenedAt = Date.now()
  onChange()
}

/** Semua sessionId yang masih dirujuk profil mana pun. */
export function referencedSessionIds(): Set<string> {
  const ids = new Set<string>()
  for (const profile of profiles) {
    for (const tab of profile.tabs) ids.add(tab.sessionId)
  }
  return ids
}
