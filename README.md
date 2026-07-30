# DEV Browser

Browser berbasis Chromium (Electron) di mana **setiap tab punya sesinya sendiri**.
Cookie, localStorage/IndexedDB, dan cache tab A sepenuhnya terpisah dari tab B —
efeknya seperti multi-profile Chrome, tapi semua profil hidup berdampingan dalam
**satu window**, dan tiap tab bisa diberi nama sendiri.

## Fitur

- **Window frameless** — bilah tab merangkap title bar, seperti Chrome. Seret bilah
  untuk memindahkan window; klik ganda untuk memaksimalkan.
- **Window Manager** — window pembuka berisi daftar profil window. Menutup window
  tidak menghapusnya; bisa dibuka kembali kapan pun. `Ctrl+Shift+O` memanggilnya,
  atau lewat **ikon tray**.
- **Ikon tray** — Window Manager tidak muncul di taskbar; diminimalkan berarti
  pindah ke tray. Klik kiri memunculkannya, klik kanan membuka daftar profil.
- **Banyak window** (`Ctrl+N`) — tiap window punya kumpulan tab dan sesinya sendiri.
- **Multi tab** dengan drag untuk mengubah urutan.
- **Rename tab** — nama pilihan Anda, tidak ikut berubah saat judul halaman berubah.
  Dobel-klik pada tab, tekan `F2`, atau klik kanan → Ganti nama. Kosongkan namanya
  untuk kembali mengikuti judul halaman.
- **Warna tab** — klik kanan pada tab untuk memilih salah satu dari 8 warna.
  Saat tab itu aktif, **blok address bar ikut mewarnai diri** sesuai warna tabnya,
  sehingga jelas akun mana yang sedang dilihat.
- **Sesi terisolasi per tab** — tiap tab baru mendapat folder sesi sendiri.
  Titik warna kecil di kiri tab hanya muncul bila sesinya dipakai bersama tab lain
  (mis. popup login yang mewarisi sesi induknya); kalau setiap tab punya sesinya
  sendiri, titik itu tidak berarti apa-apa dan sengaja disembunyikan.
- **Sesi & tab bertahan** setelah aplikasi ditutup. Tab kembali dengan nama, warna,
  dan URL-nya, tetapi **isinya sengaja tidak dimuat otomatis** — membuka aplikasi
  dengan 15 tab tersimpan tidak akan langsung menembak 15 situs sekaligus. Tekan
  tombol muat ulang (atau Enter di address bar) untuk memuat halamannya.
- **DevTools per tab** (`F12`), **find in page** (`Ctrl+F`).
- **Download manager** di `browser://downloads`, mencatat sesi asal tiap unduhan.
- **Simpan sandi & isi otomatis** — sandi dienkripsi dengan kunci sistem operasi;
  daftarnya di `browser://passwords`.
- **Pencarian lewat Google** untuk teks yang bukan URL di address bar.
- **Uji responsif** (`Ctrl+Shift+M`) — satu window berisi beberapa viewport device
  sekaligus, dengan gulir/klik/ketikan yang tersinkron antar viewport.
- **Proxy & User-Agent per sesi**, termasuk autentikasi proxy.

## Menjalankan

```bash
npm install
```

```bash
npm run dev
```

Hanya satu instance yang boleh memakai satu folder data — dua proses yang menulis
folder sesi yang sama akan merusaknya. Jadi kalau versi terpasang sedang berjalan,
`npm run dev` akan langsung keluar tanpa pesan. Untuk menjalankan keduanya
bersamaan, beri mode dev folder datanya sendiri:

```bash
BROWSER_USER_DATA="$APPDATA/my-dev-browser-dev" npm run dev
```

Perintah lain:

```bash
npm run build
```

```bash
npm test
```

```bash
npm run dist
```

`npm run dist` menghasilkan installer NSIS di `release/`.

## Pintasan Keyboard

| Pintasan | Aksi |
| --- | --- |
| `Ctrl+T` | Tab baru (sesi baru) |
| `Ctrl+W` | Tutup tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Tab berikutnya / sebelumnya |
| `Ctrl+1`..`Ctrl+8` | Lompat ke tab ke-n |
| `Ctrl+9` | Tab terakhir |
| `Ctrl+L` | Fokus ke address bar |
| `Ctrl+F` | Cari di halaman |
| `F2` | Ganti nama tab aktif |
| `F12` | DevTools tab aktif |
| `Ctrl+R` / `F5` | Muat ulang |
| `Alt+←` / `Alt+→` | Kembali / maju |
| `Ctrl+Shift+O` | Window Manager |
| `Ctrl+N` | Window baru |
| `Esc` | Tutup find bar atau dialog |

Karena window frameless, tombol minimize/maximize/close digambar sendiri di ujung
kanan bilah tab — bukan memakai Window Controls Overlay bawaan Electron, sebab
variabel `env(titlebar-area-*)` miliknya tidak dijamin sampai ke child
`WebContentsView` pada `BaseWindow`, dan seluruh UI kita hidup di dalam child view.

## Window Manager

Menjalankan aplikasi membuka **Window Manager** lebih dulu, bukan langsung window
browser. Dari situ Anda memilih profil mana yang dibuka.

Satu profil = satu kumpulan tab beserta sesi-sesinya. **Menutup window tidak
menghapus profilnya** — tabnya disimpan kembali ke profil itu dan bisa dibuka lagi
kapan pun. Sebelumnya window yang ditutup langsung dibuang dari state, sehingga
hanya window terakhir yang bisa kembali.

Satu profil hanya boleh terbuka di satu window; membukanya lagi hanya memfokuskan
window yang sudah ada. Dua window atas satu profil akan saling menimpa tabnya.

`Window baru` dan `Tentang` ada di sini, bukan lagi di toolbar browser.

### Tray

Window Manager memakai `skipTaskbar`, jadi tidak punya entri di taskbar. Karena
itu **diminimalkan berarti disembunyikan sepenuhnya** — kalau hanya diminimalkan,
tidak ada tempat untuk memanggilnya kembali.

Ikon tray adalah jalan kembalinya: klik kiri memunculkan Window Manager, klik
kanan menampilkan daftar profil (bisa dibuka langsung dari situ) beserta `Keluar`.
Menu tray dibangun ulang setiap kali dibuka agar daftar profilnya selalu terbaru.

Konsekuensinya: kalau Anda meminimalkan Window Manager lalu menutup semua window
browser, aplikasi **tetap hidup** di tray — itu memang perilaku aplikasi bertray.
Untuk benar-benar keluar, pakai `Keluar` di menu tray.

## Cara Kerja Isolasi Sesi

Tiap tab memanggil `session.fromPath()` dengan folder miliknya sendiri di
`%APPDATA%\my-dev-browser\sessions\<id-tab>\`. Chromium menjaga cookie, storage,
dan cache tetap terpisah antar sesi — jadi isolasinya berasal dari mesin browser
itu sendiri, bukan dari lapisan buatan di atasnya.

Ada **satu pengecualian yang disengaja**: tab yang dibuka oleh halaman
(`target="_blank"` atau `window.open`) **mewarisi sesi tab induknya**. Tanpa ini
setiap alur login pihak ketiga (OAuth) akan rusak, karena popup login tidak akan
mengenali sesi yang sedang berjalan. Hanya tab yang Anda buka sendiri lewat
`Ctrl+T` atau tombol `+` yang mendapat sesi baru.

Saat sebuah tab ditutup, isi sesinya dikosongkan segera, lalu foldernya dihapus
saat aplikasi berikutnya dijalankan — Windows masih mengunci folder itu selama
aplikasi hidup.

## Uji Responsif

`Ctrl+Shift+M` (atau tombol ikon device di toolbar) membuka window berisi
beberapa viewport berdampingan, masing-masing meniru satu device.

Yang membuatnya berbeda dari tool sejenis: seluruh viewport memakai **sesi tab
asalnya**, jadi Anda menguji tampilan responsif dalam keadaan sudah login sebagai
akun tertentu.

Device disusun kiri ke kanan dan **membungkus ke baris berikutnya** begitu tidak
muat, jadi luapannya ke bawah — bukan menjulur keluar layar ke samping sementara
ruang di bawah menganggur. Gulirannya tegak.

Emulasinya memakai `webContents.enableDeviceEmulation()` — mekanisme yang sama
dengan device mode di DevTools. Halaman benar-benar melihat lebar CSS device
(mis. 393px), lalu hasilnya diperkecil agar muat di layar; jadi media query
menyala di ambang yang benar. Ini bukan sekadar mengecilkan zoom — kebijakan zoom
Chromium bersifat same-origin lintas window, sehingga cara itu akan membuat semua
viewport dari situs yang sama ikut berubah bersamaan.

Sinkronisasi gulir/klik/ketikan dijalankan lewat CDP (`webContents.debugger`),
bukan preload. Konsekuensinya: **window ini menyuntikkan skrip kecil ke halaman**,
tidak seperti tab biasa yang sama sekali tidak diberi preload. Skrip itu hanya
melapor keluar; ia tidak punya akses balik ke main process. Efek lain: DevTools
tidak bisa dibuka pada viewport yang sedang tersinkron, karena hanya satu debugger
yang boleh terpasang pada satu webContents.

Tiap viewport adalah satu proses renderer penuh (±80–150 MB), jadi pilih device
seperlunya.

## Sandi Tersimpan

Setelah Anda mengirim form login, muncul bilah tawaran untuk menyimpannya. Saat
membuka situs itu lagi, form terisi otomatis — **hanya bila tersimpan tepat satu
kredensial** untuk situs tersebut. Dengan dua atau lebih, pengisian otomatis
berarti menebak akun, dan pada browser yang justru dipakai untuk banyak akun
sekaligus salah tebak itu merugikan; pilihannya lewat tombol kunci di toolbar.

Sandi dienkripsi lewat `safeStorage` Electron. **Batasnya perlu dipahami:** di
Windows itu DPAPI, yang melindungi dari pengguna lain di komputer yang sama tetapi
tidak dari program lain yang berjalan sebagai Anda. Chrome pun begitu. Kalau
enkripsi sistem tidak tersedia, penyimpanan ditolak — tidak ada jalur cadangan
yang menulis sandi apa adanya.

Deteksi form dan pengisiannya tidak memakai preload, karena halaman web sengaja
tidak pernah diberi preload. Arahnya dipisah: main mengisi lewat
`executeJavaScript`, dan halaman melapor balik lewat pesan console dengan penanda
yang dibaca event `console-message`. Origin selalu ditentukan dari webContents,
bukan dari isi laporan — halaman tidak boleh bisa menyimpan kredensial atas nama
situs lain. Laporan dari iframe diabaikan; hanya frame utama yang didengar.

## Pembaruan Otomatis

Aplikasi terpasang memeriksa GitHub Releases sekali saat dijalankan, mengunduh di
latar bila ada versi lebih baru, lalu **menunggu Anda** menekan
`Mulai ulang & pasang` di dialog Tentang. Statusnya juga terlihat di sana, dan
tombol `Periksa pembaruan` memaksa pemeriksaan ulang kapan saja.

Kegagalan pembaruan sengaja tidak pernah mengganggu pemakaian: tidak ada jaringan,
rilisnya masih draft, atau reponya belum ada — semuanya berakhir sebagai baris
status, bukan dialog galat atau proses yang mati.

Nama repo **tidak pernah disebut di dalam kode**. electron-builder menulis blok
`publish` dari `electron-builder.yml` ke `app-update.yml` di dalam paket, dan
electron-updater membacanya dari situ.

### Menerbitkan versi baru

Rilisnya otomatis. Yang perlu Anda lakukan hanya dua hal:

1. Naikkan `version` di `package.json`.
2. Tambahkan entrinya ke `src/shared/changelog.ts`.

Push ke `master`, dan `.github/workflows/release.yml` mengerjakan sisanya:
menjalankan test, membangun installer, menyusun catatan rilis dari CHANGELOG,
lalu menerbitkan rilis GitHub bertag `v<versi>` berisi installer, `.blockmap`,
dan `latest.yml`.

**Yang memicunya adalah perubahan versi, bukan setiap push.** Commit yang tidak
menaikkan `version` berhenti di langkah pertama tanpa membangun apa pun. Tanpa
penjaga itu, push kedua akan menabrak tag yang sudah ada — atau lebih buruk,
menimpa installer yang sudah beredar dengan isi berbeda di bawah nomor versi
yang sama.

Lupa menulis entri changelog juga menghentikan rilis: `scripts/release-notes.mjs`
keluar dengan galat, karena rilis tanpa catatan perubahan tidak berguna bagi
siapa pun.

Bagian yang mudah rusak diam-diam dikunci `tests/release.test.ts`: nama berkas
yang diunggah workflow harus sama persis dengan `artifactName`, `latest.yml`
harus ikut, dan electron-builder dilarang menerbitkan sendiri — default-nya
membuat rilis **draft**, dan rilis draft tidak terlihat oleh electron-updater
sama sekali.

Kalau perlu manual: `npm run dist`, lalu unggah ketiga berkas itu ke rilis
GitHub bertag `v<versi>` dengan status published.

Dua hal yang mudah menjebak:

- **`electron-updater` harus ada di `dependencies`, bukan `devDependencies`,**
  dan `node_modules/**` harus tercantum di `files`. Salah satunya saja hilang,
  modulnya tidak ikut terpaket dan aplikasi terpasang gagal memeriksa versi.
  Keduanya dikunci oleh `tests/updater.test.ts`.
- **Nama installer sengaja tanpa spasi** (`dev-browser-…`, bukan `DEV Browser-…`).
  GitHub mengganti spasi pada nama aset yang diunggah, sedangkan updater mencari
  nama persis seperti di `latest.yml` — satu spasi saja membuat tiap pembaruan
  berakhir 404.
- **Buildnya belum ditandatangani.** Pembaruan tetap berjalan, tetapi SmartScreen
  memperingatkan pemasangan pertama. Menghilangkannya butuh sertifikat code
  signing, bukan perubahan kode.

Folder data tetap `%APPDATA%\my-dev-browser` meski nama aplikasi, `appId`, dan
pemilik repo sudah berganti — itu alamat data, bukan identitas. Konsekuensi dari
`appId` yang berubah: pemasangan pertama versi ini **tidak menimpa** "My Dev
Browser" lama; uninstall yang lama sekali secara manual.

## Batasan yang Perlu Diketahui

- **Tidak ada Widevine.** Layanan dengan DRM (Netflix, Spotify, dsb.) tidak akan
  berjalan. Electron tidak menyertakan modul Widevine; ini butuh CEF, bukan Electron.
- **Login Google mungkin ditolak.** Google memblokir sign-in dari "embedded browser
  framework" berdasarkan User-Agent. Coba setel User-Agent Chrome lewat tombol sesi
  (◇) di toolbar bila ini Anda butuhkan.
- **Mengganti User-Agent bukan anti-fingerprint.** Hanya header UA yang berubah;
  Client Hints (`sec-ch-ua`) tetap melaporkan Chromium yang sebenarnya.
- **Memori.** Tiap tab adalah satu proses renderer Chromium (±80–150 MB). Tab hasil
  restore baru dimuat saat diklik, tapi tab yang sudah terbuka tetap hidup.

## Struktur

```
assets/
└─ icon.png     ikon 512px yang dipakai aplikasi & installer
icon.png        berkas sumber 4096px (tidak ikut dipaketkan)
src/
├─ main/        proses utama: tab, sesi, window, IPC, shortcut, unduhan
├─ preload/     contextBridge — HANYA dipasang di UI kita, tidak di halaman web
├─ renderer/    UI React (tab strip, toolbar) + halaman internal
└─ shared/      tipe & helper yang dipakai kedua sisi
```

### Mengganti ikon

Ganti `icon.png` di root (persegi, minimal 512px), lalu buat ulang versi
kecilnya — `assets/icon.png` yang benar-benar dipakai:

```bash
npx electron -e "const{app,nativeImage}=require('electron'),fs=require('fs');fs.writeFileSync('assets/icon.png',nativeImage.createFromPath('icon.png').resize({width:512,height:512,quality:'best'}).toPNG());app.quit()"
```

Versi 4096px sengaja tidak dipakai langsung: sekali dekode memakan sekitar 67 MB
memori, dan 6,8 MB itu akan ikut membengkakkan paket aplikasi tanpa guna.
electron-builder membuat sendiri `.ico` multi-ukuran dari `assets/icon.png`.

Catatan keamanan: halaman web biasa **tidak diberi preload sama sekali**. Semua
sinyal yang dibutuhkan UI (judul, favicon, status muat, navigasi) sudah tersedia
dari event `webContents` di main process, jadi tidak ada alasan membuka jalur IPC
ke situs sembarangan.
