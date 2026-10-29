# ReqCheck

Mini program harian **28 Oktober 2026** — CLI JavaScript untuk menguji API HTTP dari berkas JSON. Cocok untuk memeriksa API tugas kuliah, backend lokal, dan smoke test sebelum deployment.

ReqCheck mengirim permintaan sungguhan, menjalankan assertion, lalu memberikan exit code serta laporan yang bisa digunakan oleh CI. Seluruh kode memakai modul bawaan Node.js; tidak ada dependensi npm eksternal.

## Fitur

- Metode GET, HEAD, POST, PUT, PATCH, DELETE, dan OPTIONS.
- URL absolut atau relatif terhadap `baseUrl`, custom header, dan body JSON.
- Assertion status HTTP, header, potongan teks, nilai JSON, dan batas durasi.
- Timeout yang mencakup penerimaan body, serta batas ukuran respons.
- Variabel lingkungan pada URL dan header, misalnya untuk alamat API dan bearer token.
- Laporan terminal, JSON, dan JUnit XML; tes berikutnya tetap berjalan ketika satu permintaan gagal.
- Validasi semua konfigurasi sebelum permintaan pertama: typo, header invalid, dan assertion kosong ditolak.
- API demo lokal beserta empat contoh pemeriksaan siap dijalankan.

## Instalasi dan demo

Gunakan **Node.js 22 atau lebih baru**. Pengujian proyek ini dilakukan dengan Node.js 24.22.1. Ekstrak arsip, lalu masuk ke folder `reqcheck-cli`.

Tidak perlu menjalankan `npm install`.

Terminal pertama:

```sh
npm run demo
```

Terminal kedua, dari folder proyek yang sama:

```sh
node bin/reqcheck.js run examples/reqcheck.json --report reports/hasil.json --junit reports/hasil.xml
```

Contoh keluaran; durasi akan berbeda pada setiap komputer:

```text
API demo ReqCheck
[LULUS] Health check (HTTP 200, 25 ms)
[LULUS] Daftar pengguna (HTTP 200, 3 ms)
[LULUS] POST JSON (HTTP 201, 4 ms)
[LULUS] Rute tidak ditemukan (HTTP 404, 2 ms)
4/4 lulus; 0 gagal. Durasi 34 ms.
```

Hentikan server demo dengan Ctrl+C. Server hanya mendengarkan `127.0.0.1`; port default `8787`. Jika mengatur variabel `PORT`, sesuaikan pula `baseUrl` dalam konfigurasi.

Untuk membuat konfigurasi baru dari contoh:

```sh
node bin/reqcheck.js init
node bin/reqcheck.js run reqcheck.json
node bin/reqcheck.js --help
```

`init` tidak menimpa berkas yang sudah ada. Nama berkas default untuk `init` dan `run` adalah `reqcheck.json`.

## Konfigurasi API sendiri

Berikut satu contoh lengkap. Jalankan terhadap API yang memiliki kontrak respons sesuai contoh ini.

```json
{
  "name": "Smoke test API kampus",
  "baseUrl": "${API_BASE_URL}",
  "timeoutMs": 5000,
  "maxResponseBytes": 1048576,
  "tests": [
    {
      "name": "Profil pengguna",
      "url": "/api/profile",
      "headers": { "Authorization": "Bearer ${API_TOKEN}" },
      "expect": {
        "status": 200,
        "headers": { "content-type": "application/json" },
        "json": { "/data/active": true },
        "maxDurationMs": 1500
      }
    }
  ]
}
```

Pada shell Bash/zsh:

```sh
export API_BASE_URL=http://127.0.0.1:3000
read -rsp 'API token: ' API_TOKEN; echo
export API_TOKEN
node bin/reqcheck.js run api.json --report reports/api.json
```

Pada PowerShell, atur variabel lingkungan melalui `$env:API_BASE_URL` dan `$env:API_TOKEN` sebelum menjalankan perintah Node yang sama. Program membaca environment proses; berkas `.env` tidak dibaca otomatis.

Substitusi `${NAMA}` hanya berlaku pada `baseUrl`, `url`, dan **header permintaan**. Isi `json` dan semua nilai `expect` tetap literal. Variabel yang belum diatur menghasilkan exit code `2` sebelum tes dijalankan.

### Kolom konfigurasi

| Kolom | Arti |
| --- | --- |
| `name` | Nama suite; default `ReqCheck`. |
| `baseUrl` | Opsional jika semua URL tes absolut; HTTP/HTTPS tanpa query atau fragmen. |
| `timeoutMs` | Timeout default setiap tes, 1–120000 ms; default 5000. |
| `maxResponseBytes` | Batas body setiap respons setelah dekompresi, 1–10485760 byte; default 1048576. |
| `tests` | Daftar 1–100 tes, dijalankan berurutan. |

Setiap tes membutuhkan `name` yang unik, `url`, dan objek `expect` berisi minimal satu assertion. `method` default GET. `headers`, `json` sebagai body permintaan, dan `timeoutMs` per tes bersifat opsional. GET dan HEAD tidak menerima body JSON.

URL relatif mengikuti aturan `new URL()`: `baseUrl` `https://host/api/` dengan URL `users` menjadi `/api/users`, sedangkan `/users` menjadi `/users` pada akar host. Gunakan trailing slash jika `baseUrl` memuat direktori.

### Assertion

| Kolom dalam `expect` | Contoh | Perilaku |
| --- | --- | --- |
| `status` | `200` atau `[200, 201]` | Salah satu status harus cocok. |
| `headers` | `{ "x-service": "kampus" }` | Nama header tidak peka huruf besar/kecil; nilai dibandingkan persis. |
| `bodyIncludes` | `"berhasil"` | Respons teks harus mengandung potongan ini. |
| `json` | `{ "/data/0/id": 7 }` | Bandingkan nilai JSON secara mendalam dan peka tipe. |
| `maxDurationMs` | `1500` | Waktu menerima seluruh body harus tidak melebihi batas. |

Untuk header `content-type`, cocokkan nilai lengkap, termasuk `; charset=utf-8` bila ada. Kelompok `headers` dan `json` tidak boleh kosong. Semua assertion yang disebutkan harus terpenuhi.

Kunci dalam `expect.json` memakai **JSON Pointer**:

- `/users/0/id` menunjuk `id` pengguna pertama.
- `""` menunjuk seluruh respons JSON, termasuk jika respons berupa array atau `null`.
- `~1` berarti `/` dan `~0` berarti `~` dalam nama properti. Contoh: `/a~1b` menunjuk properti `a/b`.
- Nilai `7` berbeda dengan `"7"`. Properti yang hilang gagal, meskipun nilai harapannya `null`.

## Laporan dan exit code

```sh
node bin/reqcheck.js run api.json --report reports/api.json --junit reports/api.xml
```

Folder laporan dibuat otomatis. Laporan lama pada lokasi yang sama diganti melalui penulisan berkas sementara dan rename. Konfigurasi dan kedua laporan harus menggunakan berkas yang berbeda. Laporan disimpan setelah seluruh suite selesai; interupsi proses sebelum selesai tidak menjamin laporan tersedia.

| Exit code | Makna |
| --- | --- |
| `0` | Semua tes lulus. |
| `1` | Ada assertion, timeout, koneksi, atau batas respons yang gagal. |
| `2` | Argumen, konfigurasi, atau operasi berkas gagal. |

Jika penyimpanan laporan gagal, kode `2` dipakai sekalipun pemeriksaan API telah selesai. Hasil pemeriksaan tetap ditampilkan di terminal.

Laporan mencatat status, durasi, hasil assertion, dan kategori kesalahan. Nilai query URL, header permintaan, body permintaan, body respons, dan nilai harapan tidak disalin ke laporan. Nama suite/tes, path URL, nama header assertion, dan JSON Pointer tetap tercantum; gunakan nama/path yang sesuai untuk dibagikan.

## Pengujian

```sh
npm test
```

Tes memakai `node:test` dan server HTTP lokal sungguhan, tanpa layanan internet. Cakupan: validasi konfigurasi, environment, POST JSON, status/header/teks/JSON Pointer, durasi, timeout body, batas ukuran stream, koneksi putus, redirect, HEAD, exit code CLI, pembuatan konfigurasi, dan laporan JSON/JUnit.

Hasil eksekusi aktual dan laporan empat tes terhadap server demo disertakan dalam folder `verification/`.

## Batas ruang lingkup

Permintaan berdiri sendiri, tanpa ekstraksi token dari respons, cookie jar, retry, atau eksekusi paralel. Redirect tidak diikuti sehingga status 3xx dapat diuji secara langsung. Seluruh body dibaca sampai selesai dengan batas ukuran dan timeout, termasuk ketika assertion hanya memeriksa status. Sertifikat HTTPS diverifikasi oleh Node.js.

Konfigurasi maksimum 1 MiB. URL harus HTTP/HTTPS tanpa kredensial URL atau fragmen `#`. Header transport `content-length`, `connection`, `transfer-encoding`, dan `upgrade` dikelola klien HTTP sehingga tidak boleh diatur pada permintaan; header tersebut tetap dapat diperiksa dalam `expect.headers`.

## Struktur

```text
bin/reqcheck.js          Entry point CLI
src/config.js           Pembaca dan validator konfigurasi
src/runner.js           Eksekusi HTTP dan assertion
src/reporters.js        Laporan terminal, JSON, dan JUnit
src/cli.js              Perintah init/run dan exit code
examples/               Konfigurasi serta server demo lengkap
test/                   Tes otomatis
verification/           Bukti hasil pemeriksaan lokal
```

Lisensi MIT. Lihat `LICENSE`.
