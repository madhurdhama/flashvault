# ⚡ FlashVault

**Fast. Local. Simple.**

FlashVault is a lightweight, high-speed local file server built with Flask for fast and simple file sharing over your local network.
It allows you to browse, upload, download, and manage files over your local network — no internet required.

Perfect for quickly transferring files between your PC, phone, or other devices on the same Wi-Fi.

---

## 🚀 Features

- ⚡ High-speed local file transfers (LAN optimized)
- 📁 Browse folders and files from any browser
- ⬆️ Upload large files with progress tracking
- ⬇️ Download files instantly
- 🧭 Clean and responsive web interface
- 🧩 Minimal dependencies, easy to run

---

## 🛠️ Installation

**Prerequisites:** Python 3.8 or newer

```bash
git clone https://github.com/madhurdhama/flashvault.git
cd flashvault
pip install flask
```

---

## 🌐 Running the server

```bash
python3 app.py
```

Find your local IP address and open it in your browser:
```
http://<your-ip>:8000
```

---

## 📁 Directory Structure

```
flashvault/
├── app.py            # Main Flask application
├── config.py         # Configuration settings
├── utils.py          # Helper functions
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── templates/
    └── index.html

~/FlashVault/          # Shared files directory
```

---

## 🧰 Tech Stack

- Python 3 (Flask)
- HTML, CSS, JavaScript
- Local filesystem storage
- HTTP-based file transfer

---

## ⚠️ Security Notice

- Designed for **local network use only**
- No authentication by default
- Do **not** expose directly to the internet
- Use only on trusted networks
