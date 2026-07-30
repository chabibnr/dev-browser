import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { SavedCredential } from '@shared/types'

/**
 * Penyimpanan kredensial.
 *
 * Sandi dienkripsi lewat `safeStorage`, yang memakai DPAPI di Windows dan
 * Keychain di macOS. Kalau enkripsi tidak tersedia, penyimpanan DITOLAK — tidak
 * ada jalur cadangan yang menulis sandi apa adanya, karena berkas sandi
 * plaintext lebih berbahaya daripada tidak punya fitur ini sama sekali.
 *
 * Batasnya perlu dipahami: di Windows, DPAPI melindungi dari pengguna LAIN di
 * mesin yang sama, bukan dari aplikasi lain milik pengguna yang sama. Chrome pun
 * begitu. Ini bukan tempat menyimpan sandi yang paling berharga.
 */

interface StoredCredential extends SavedCredential {
  /** Hasil enkripsi safeStorage, disandikan base64. */
  secret: string
}

interface Vault {
  version: number
  credentials: StoredCredential[]
  /** Origin yang pengguna minta jangan pernah ditawari lagi. */
  blocked: string[]
}

const VAULT_VERSION = 1
const vaultFile = (): string => path.join(app.getPath('userData'), 'credentials.json')

let cache: Vault | null = null

function load(): Vault {
  if (cache) return cache
  try {
    const parsed = JSON.parse(fs.readFileSync(vaultFile(), 'utf-8')) as Vault
    if (parsed.version !== VAULT_VERSION) throw new Error('versi tidak dikenal')
    cache = {
      version: VAULT_VERSION,
      credentials: (parsed.credentials ?? []).filter(
        (c) => typeof c?.id === 'string' && typeof c.origin === 'string' && typeof c.secret === 'string'
      ),
      blocked: (parsed.blocked ?? []).filter((b) => typeof b === 'string')
    }
  } catch {
    cache = { version: VAULT_VERSION, credentials: [], blocked: [] }
  }
  return cache
}

function persist(): void {
  const vault = load()
  const target = vaultFile()
  try {
    // Tulis ke berkas sementara lalu rename: crash di tengah penulisan tidak
    // boleh meninggalkan vault yang setengah jadi.
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(vault, null, 2), 'utf-8')
    fs.renameSync(`${target}.tmp`, target)
  } catch (err) {
    console.error('[credentials] gagal menyimpan vault:', err)
  }
}

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** Metadata saja — sandi tidak pernah ikut keluar dari modul ini tanpa diminta. */
export function listCredentials(): SavedCredential[] {
  return load().credentials.map(({ secret: _secret, ...rest }) => rest)
}

export function credentialsFor(origin: string): SavedCredential[] {
  return listCredentials().filter((c) => c.origin === origin)
}

export function findCredential(id: string): SavedCredential | null {
  const found = load().credentials.find((c) => c.id === id)
  if (!found) return null
  const { secret: _secret, ...rest } = found
  return rest
}

export function isBlocked(origin: string): boolean {
  return load().blocked.includes(origin)
}

export function blockOrigin(origin: string): void {
  const vault = load()
  if (!vault.blocked.includes(origin)) {
    vault.blocked.push(origin)
    persist()
  }
}

export function unblockOrigin(origin: string): void {
  const vault = load()
  vault.blocked = vault.blocked.filter((b) => b !== origin)
  persist()
}

export function blockedOrigins(): string[] {
  return [...load().blocked]
}

export async function saveCredential(
  origin: string,
  username: string,
  password: string
): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('[credentials] enkripsi OS tidak tersedia — penyimpanan dibatalkan')
    return false
  }

  const secret = (await safeStorage.encryptStringAsync(password)).toString('base64')
  const vault = load()
  const now = Date.now()
  // Satu entri per (origin, username): masuk lagi dengan sandi baru berarti
  // memperbarui, bukan menumpuk duplikat.
  const existing = vault.credentials.find((c) => c.origin === origin && c.username === username)

  if (existing) {
    existing.secret = secret
    existing.updatedAt = now
  } else {
    vault.credentials.push({ id: randomUUID(), origin, username, createdAt: now, updatedAt: now, secret })
  }
  persist()
  return true
}

export async function getPassword(id: string): Promise<string | null> {
  const found = load().credentials.find((c) => c.id === id)
  if (!found) return null
  try {
    // Versi async mengembalikan objek, bukan string langsung.
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(found.secret, 'base64')
    )

    // Kunci OS bisa berotasi. Kalau diminta, sandinya dienkripsi ulang sekarang —
    // mengabaikan sinyal ini membuat entri lama akhirnya tidak bisa dibuka lagi.
    if (shouldReEncrypt) {
      found.secret = (await safeStorage.encryptStringAsync(result)).toString('base64')
      persist()
    }
    return result
  } catch (err) {
    console.error('[credentials] gagal mendekripsi sandi:', err)
    return null
  }
}

/** Cocok bila sandi tersimpan untuk (origin, username) sudah sama. */
export async function matches(origin: string, username: string, password: string): Promise<boolean> {
  const found = load().credentials.find((c) => c.origin === origin && c.username === username)
  if (!found) return false
  return (await getPassword(found.id)) === password
}

export function deleteCredential(id: string): void {
  const vault = load()
  const before = vault.credentials.length
  vault.credentials = vault.credentials.filter((c) => c.id !== id)
  if (vault.credentials.length !== before) persist()
}
