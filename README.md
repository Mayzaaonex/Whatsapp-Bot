# 📦 Dependencies

- **Node.js** v20+
- **ffmpeg** (required for media processing)
  - **Windows:** Put it at `C:\\ffmpeg\\bin\\ffmpeg.exe`
  - **Linux:** `sudo apt install ffmpeg`
  - **Termux:** `pkg install ffmpeg`
- **Git** (for auto-update)

## 🚀 Install

```bash
npm install
```

## ▶️ Start the Bot

```bash
npm start
```

## 🔐 Pair Your Device

On first run, choose one of the following:

1. **QR Code**
2. **Pairing Code**

Follow the on-screen instructions.

## 📂 Project Structure

```text
.
├── main.js
├── index.js
├── config.json
├── logs.md
├── package.json
├── assets/
├── command/
├── _plugins/
│   ├── ai/
│   ├── ai-image/
│   ├── berita/
│   ├── downloader/
│   ├── general/
│   ├── group/
│   ├── maker/
│   ├── owner/
│   └── tools/
├── system/
├── session/
└── tmp/
```
