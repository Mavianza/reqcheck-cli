# Hasil pemeriksaan lokal

Proyek harian 28 Oktober 2026. Lingkungan aktual: Node.js 24.22.1, npm 11.9.0, Linux.

## Tes otomatis

Perintah: `npm test`.

Hasil: **28 tes lulus, 0 gagal, 0 dilewati**. Keluaran asli disimpan pada `npm-test.txt`. Tes jaringan memakai server HTTP lokal sungguhan dengan port sementara, tanpa API internet.

## Demo lengkap

Server aktual: `node examples/demo-server.js`, port lokal 8787.

Perintah CLI aktual:

```sh
node bin/reqcheck.js run examples/reqcheck.json --report verification/demo-result.json --junit verification/demo-result.xml
```

Hasil: **4/4 pemeriksaan lulus** — health check, daftar pengguna, POST JSON, dan rute 404. Exit code `0`. Lihat keluaran terminal `demo-output.txt`, laporan JSON `demo-result.json`, dan JUnit `demo-result.xml`. Durasi dan waktu di dalam laporan berasal dari eksekusi aktual.

## GitHub

Catatan akses di bawah mencatat keadaan saat pembuatan arsip awal. Publikasi berikutnya ditangani oleh `Mavianza/daily-app-publisher`; identitas paket dan commit penerbit tercatat pada `.daily-app-publisher.json` di repo hasil.

Belum ada commit atau push GitHub untuk proyek ini. Pemeriksaan koneksi mengembalikan 404 untuk `Mavianza/reqcheck-cli` dan `Mavianza/daily-app-publisher`. Koneksi yang tersedia tidak menyediakan aksi membuat repositori baru; GitHub CLI serta token CLI juga tidak tersedia pada lingkungan eksekusi ini. Proyek lengkap disediakan sebagai arsip unduhan.
