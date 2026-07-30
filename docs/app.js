/*
 * Dua hal saja: mockup yang bisa diklik, dan info rilis yang diambil langsung
 * dari GitHub.
 *
 * Info rilis sengaja diambil saat halaman dibuka, bukan ditulis tetap di HTML.
 * Kalau ditulis tetap, tiap rilis baru menuntut halaman ini ikut diedit — dan
 * cepat atau lambat akan terlupa, lalu halaman muka menawarkan versi lama.
 */

const REPO = 'chabibnr/dev-browser';

/* ----------------------------------------------------------- mockup demo */

const demo = document.querySelector('#demo');

if (demo) {
  const tabs = Array.from(demo.querySelectorAll('.tab'));
  const omni = demo.querySelector('#omni');
  const card = demo.querySelector('#page-card');
  const avatar = demo.querySelector('#avatar');
  const user = demo.querySelector('#who-user');
  const role = demo.querySelector('#who-role');
  const nomor = demo.querySelector('#who-n');

  // Warna tab dipasang sebagai custom property sekali di awal; sisanya
  // dikerjakan CSS lewat color-mix, sama seperti di aplikasinya.
  tabs.forEach((tab) => tab.style.setProperty('--c', tab.dataset.color));

  function pilih(tab, index) {
    tabs.forEach((t) => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });

    const warna = tab.dataset.color;
    [omni, card, avatar].forEach((el) => el && el.style.setProperty('--c', warna));

    avatar.textContent = tab.dataset.init;
    user.textContent = tab.dataset.user;
    role.textContent = tab.dataset.role;
    nomor.textContent = String(index + 1);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => pilih(tab, index));
    tab.setAttribute('aria-selected', String(tab.classList.contains('is-active')));
  });

  pilih(tabs[0], 0);
}

/* ------------------------------------------------------------ info rilis */

function ukuran(bytes) {
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

function tanggal(iso) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

async function muatRilis() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GitHub menjawab ${res.status}`);

  const rilis = await res.json();
  const exe = (rilis.assets || []).find((a) => a.name.endsWith('.exe'));
  if (!exe) throw new Error('rilis tanpa installer');

  const versi = (rilis.tag_name || '').replace(/^v/, '');

  document.querySelectorAll('#unduh, #unduh2').forEach((a) => {
    a.href = exe.browser_download_url;
  });

  const meta = `${versi} · ${ukuran(exe.size)} · Windows x64`;
  const el1 = document.querySelector('#unduh-meta');
  const el2 = document.querySelector('#unduh2-meta');
  if (el1) el1.textContent = meta;
  if (el2) el2.textContent = meta;

  const baris = document.querySelector('#rilis-baris');
  if (baris) {
    baris.textContent = `Versi ${versi} · dirilis ${tanggal(rilis.published_at)} · ${ukuran(exe.size)}`;
  }
}

muatRilis().catch(() => {
  // Jaringan mati, batas rate GitHub terlampaui, atau belum ada rilis sama
  // sekali. Tombolnya sudah menunjuk ke /releases/latest sejak di HTML, jadi
  // yang perlu diperbaiki hanya teksnya — halaman tetap bisa dipakai.
  const el1 = document.querySelector('#unduh-meta');
  const el2 = document.querySelector('#unduh2-meta');
  if (el1) el1.textContent = 'lihat rilis terbaru';
  if (el2) el2.textContent = 'lihat rilis terbaru';

  const baris = document.querySelector('#rilis-baris');
  if (baris) baris.textContent = 'Daftar rilis ada di GitHub.';
});

/* ------------------------------------------------------- reveal on scroll */

const perluGerak = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');

if (perluGerak && 'IntersectionObserver' in window) {
  const pengamat = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        pengamat.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.06 }
  );

  reveals.forEach((el) => pengamat.observe(el));
} else {
  // Tanpa IntersectionObserver atau saat gerakan diminta dikurangi, semuanya
  // langsung terlihat. Halaman yang isinya tak pernah muncul jauh lebih buruk
  // daripada halaman tanpa animasi.
  reveals.forEach((el) => el.classList.add('is-in'));
}
