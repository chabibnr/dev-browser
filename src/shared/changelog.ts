export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

/**
 * Riwayat perubahan, terbaru di atas.
 *
 * Disimpan sebagai data, bukan berkas markdown yang diurai saat build: isinya
 * ikut terkompilasi sehingga tidak bisa tertinggal di luar paket, dan dialog
 * About tidak perlu membaca berkas saat dijalankan.
 */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.8.1',
    date: '2026-07-30',
    changes: [
      'Tombol Hapus di Window Manager kini berwarna danger, sehingga tidak lagi tampak sama dengan Ganti nama di sebelahnya',
      'Warna merah dijadikan token --danger dan dipakai bersama oleh tombol tutup tab serta penanda galat'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-07-30',
    changes: [
      'Aplikasi berganti nama menjadi DEV Browser, dengan appId dan pemilik repo baru (net.chabibnr.devbrowser). Folder data lama tetap dipakai, tapi pemasangan pertama tidak menimpa versi lama — uninstall "My Dev Browser" sekali secara manual',
      'Pembaruan otomatis lewat GitHub Releases: diperiksa saat aplikasi dijalankan, diunduh di latar, dipasang saat Anda menyetujuinya',
      'Status pembaruan dan tombol "Periksa pembaruan" ditambahkan ke dialog Tentang'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-07-30',
    changes: [
      'Ikon tray sebagai pintu masuk Window Manager: klik kiri memunculkannya, klik kanan menampilkan daftar profil',
      'Window Manager tidak lagi muncul di taskbar, dan diminimalkan berarti pindah ke tray',
      'Aplikasi tetap hidup di tray walau semua window ditutup lewat minimize; keluar lewat menu tray'
    ]
  },
  {
    version: '0.6.1',
    date: '2026-07-30',
    changes: [
      'Perbaikan: tombol biru berubah putih saat di-hover sehingga tulisannya hilang',
      'Perbaikan: penanda "tidak ditemukan" di find bar tidak pernah terlihat karena kotaknya selalu terfokus saat diketik',
      'CSS menu HTML lama dibersihkan setelah menu konteks berpindah ke menu sistem'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-07-30',
    changes: [
      'Window Manager: window pembuka berisi daftar profil window, bisa dibuka, ditutup, diganti nama, dan dihapus',
      'Menutup window tidak lagi menghapusnya — profilnya bertahan dan bisa dibuka kembali kapan pun, bukan hanya window terakhir',
      'Window baru dan Tentang pindah ke Window Manager; tombol titik tiga dihapus dari toolbar browser',
      'Ctrl+Shift+O memanggil Window Manager dari window browser mana pun',
      'Perbaikan: perubahan terakhir sebelum aplikasi keluar bisa hilang karena state dibaca dari penyimpan profil, bukan dari tab yang hidup'
    ]
  },
  {
    version: '0.5.1',
    date: '2026-07-30',
    changes: [
      'Tombol uji responsif dipindah ke kanan address bar; sisi kirinya kini hanya berisi navigasi'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-07-30',
    changes: [
      'Simpan sandi login, dengan pengisian otomatis saat hanya ada satu kredensial untuk situs itu',
      'Tombol kunci di toolbar untuk memilih akun bila tersimpan lebih dari satu',
      'Halaman browser://passwords untuk melihat, menghapus, dan mengelola situs yang tidak ingin ditawari',
      'Sandi dienkripsi memakai kunci sistem operasi; bila enkripsi tidak tersedia, penyimpanan ditolak alih-alih menulis teks biasa'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-07-29',
    changes: [
      'Window baru (Ctrl+N) dengan kumpulan tab dan sesinya sendiri',
      'Menu klik kanan dan menu titik tiga kini memakai menu sistem, sehingga halaman tidak lagi tertutup saat menu dibuka',
      'Menu titik tiga di toolbar, berisi dialog Tentang dengan info versi dan riwayat perubahan',
      'Zoom pada responsive window memakai tombol −/+ dan kotak angka, menggantikan slider',
      'Perbaikan: aplikasi bisa menggantung tanpa pernah keluar bila pembilasan cookie gagal'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-07-29',
    changes: [
      'Responsive window: device membungkus ke baris berikutnya saat tidak muat, gulirannya jadi tegak',
      'Cookie dibilas sebelum aplikasi keluar — login tidak lagi hilang bila aplikasi ditutup tak lama setelah masuk',
      'Sesi yang tidak dirujuk tab mana pun tidak lagi dihapus otomatis saat startup',
      'Menjalankan aplikasi untuk kedua kalinya kini memunculkan window yang sudah ada'
    ]
  },
  {
    version: '0.2.0',
    date: '2026-07-29',
    changes: [
      'Responsive window (Ctrl+Shift+M): banyak ukuran device sekaligus, dengan gulir, klik, dan ketikan yang tersinkron',
      'Tema terang bergaya Chrome',
      'Warna tab lewat menu klik kanan; blok address bar ikut mewarnai diri',
      'Window frameless dengan tombol jendela sendiri',
      'Ikon toolbar bergaya Chrome dan ikon aplikasi',
      'Pencarian lewat Google untuk teks yang bukan URL',
      'Perbaikan: seluruh tab hilang setiap kali window ditutup',
      'Perbaikan: tombol muat ulang tidak berfungsi pada tab hasil restore'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-07-29',
    changes: [
      'Multi tab dengan sesi terisolasi penuh per tab',
      'Rename tab yang tidak ikut berubah saat judul halaman berubah',
      'Tab, nama, dan sesi bertahan setelah aplikasi ditutup',
      'DevTools per tab dan find in page',
      'Download manager yang mencatat sesi asal tiap unduhan',
      'Proxy dan User-Agent per sesi'
    ]
  }
]
