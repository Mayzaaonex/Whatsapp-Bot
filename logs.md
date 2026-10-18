# 📋 Changelog

<!-- Format: {tanggal:bulan:tahun:version} pesan -->
<!-- Cara nambah: tambahin di PALING ATAS -->
<!-- Contoh: {14:10:2026:1.2.2} add fitur baru -->

---

{18:10:2026:1.2.8} fix update funsctions
{18:10:2026:1.2.7} fix fotolive(tools)
{18:10:2026:1.2.6} fix fotolive(tools)
{14:10:2026:1.2.5} fix bug audio swgc
{14:10:2026:1.2.4} fix bug audio swgc
{14:10:2026:1.2.3} fix bug audio swgc
{14:10:2026:1.2.2} add mp4 converter to mp3
{14:10:2026:1.2.1} add more functions for owner
{13:10:2026:1.2.0} add group commands (kick, promote, demote, add, open, close)
{13:10:2026:1.1.0} add berita commands (aljazeera, antara, bbc, cnn, kompas, guardian)
{12:10:2026:1.0.5} add autodetect downloader for social media
{12:10:2026:1.0.4} add facebook downloader with H.264 transcode + uguu fallback
{12:10:2026:1.0.3} fix sticker corrupt (pipeline + delay 2s)
{12:10:2026:1.0.2} add antilink 3 modes (all/ch/gb/off)
{12:10:2026:1.0.1} add fotolive (paired image + video)
{11:10:2026:1.0.0} initial release

---

## 📝 Cara Update

1. **Tambah entry baru di PALING ATAS** (setelah komentar)
2. Format: `{tanggal:bulan:tahun:version} pesan`
3. Contoh: `{14:10:2026:1.2.2} add fitur baru`
4. **Jangan lupa update `version` di `package.json`** biar sinkron!
5. Push ke GitHub: `bash push.sh "release 1.2.2"`

## 🔢 Version Format

Ikutin **SemVer** (Semantic Versioning):
- `1.2.3` — format `MAJOR.MINOR.PATCH`
- **MAJOR** — breaking change (misal: ganti struktur folder)
- **MINOR** — fitur baru (misal: tambah command GROUP)
- **PATCH** — fix bug (misal: fix sticker corrupt)