#  GitZipQR.v3.5 — encrypted you data and share secure with people in QR codes 📦🔐📱
# 🧪 Test
```
------
2 files [290,5 Kib, 636,4 KiB=926,9] 
Folder where throw files = 930 KiB
Total: 421 QR codes in folder [12,4 MiB]
------
```
# [TypeScript code - prototype,dev](https://github.com/RestlessByte/GitZipQR.ts)
![GitZipQR Structure](https://github.com/RestlessByte/GitZipQR/blob/main/assets/structures/structures.png)
Turns any file or folder into **encrypted QR codes** and restores them back.  
Input folders are zipped (with **relative paths only**, no absolute prefixes), then encrypted with **AES-256-GCM** (key from **scrypt**), split into calibrated **QR chunks**, and saved as **PNG** images.  
To restore, point the decoder at the PNGs — integrity is verified (chunk + global SHA-256) and the original file/zip is recreated.

**Author:** Daniil V (RestlessByte) — <https://github.com/RestlessByte>  
**License:** MIT

---
# Dependencies 
- ZIP
## ✨ Highlights

- **Strong crypto:** AES-256-GCM + scrypt KDF (N=2^15, r=8, p=#cores)  
- **Capacity auto-calibration:** always fits each chunk into a single QR (v40, ECC L by default)  
- **Integrity:** per-chunk SHA-256 and global SHA-256 of ciphertext  
- **Clean ZIP layout:** input directory is zipped as `.` → relative paths only (no absolute prefixes, no top-level wrapper)  
- **Zero external state:** everything needed to restore is inside the QR payloads  
- **Cross-platform:** Linux and Windows (MSYS2 Mingw64)

---

## 🚀 Quick Start

### 1) Install dependencies

Pick your OS and run the block below.

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install -y 
  g++ make pkg-config git 
  libssl-dev libpng-dev 
  libqrencode-dev 
  zxing-cpp 
  zip
```

**Fedora (dnf):**
```bash
sudo dnf install -y 
  gcc-c++ make git pkgconf-pkg-config 
  openssl-devel libpng-devel 
  qrencode-devel 
  zxing-cpp-devel 
  zip
```

**Arch Linux:**
```bash
sudo pacman -S --needed --noconfirm 
  base-devel git 
  openssl libpng qrencode zxing-cpp zip
```

**Windows (MSYS2 MinGW64 shell):**
```bash
pacman -S --noconfirm git make 
  mingw-w64-x86_64-toolchain 
  mingw-w64-x86_64-openssl 
  mingw-w64-x86_64-libpng 
  mingw-w64-x86_64-qrencode 
  mingw-w64-x86_64-zxing-cpp 
  zip
```

---

### 2) Build the project

```bash
git clone https://github.com/RestlessByte/GitZipQR.cpp.git
cd GitZipQR.cpp
cp src/config.example.hpp src/config.hpp
make -j$(nproc)
# binaries:
#   build/MakeEncode
#   build/MakeDecode
```

---

### 3) Encode & Decode

**Encode (file → QR PNGs):**
```bash
export GZQR_PASS='MyStrongSecret'
build/MakeEncode ./example.txt ./qrcodes
```

**Encode (folder → QR PNGs):**
```bash
export GZQR_PASS='MyStrongSecret'
build/MakeEncode ./my-folder ./qrcodes
```

**Decode (QR PNGs → restore):**
```bash
export GZQR_PASS='MyStrongSecret'
build/MakeDecode ./qrcodes ./restore
```

- File restored as `./restore/example.txt`  
- Folder restored as `./restore/my-folder.zip` (ZIP contains relative paths only)

---

## ⚙️ Defaults (`src/config.hpp`)

- **QR Version:** 40  
- **ECC Level:** L (max capacity)  
- **PNG Margin:** 1  
- **PNG Scale:** 8  
- **Default password:** `SuperSecret123` (override with `GZQR_PASS`)  
- **Progress counters:** enabled  

⚠️ Always override the password for real use.

---

## 🔐 Security

- AES-256-GCM (random 12-byte nonce, 16-byte tag)  
- scrypt KDF (N=2^15, r=8, p=#cores)  
- Per-chunk and global SHA-256 integrity checks  
- Password only from env or config (never stored in repo)  

⚠️ Always use a strong passphrase (≥12–16 chars).

---

## 🧪 Example

```bash
# prepare demo dir
mkdir -p demo/sub && echo "hello" > demo/sub/file.txt

# encode
export GZQR_PASS='demo-secret'
build/MakeEncode demo ./qrs

# decode
build/MakeDecode ./qrs ./restore

# inspect zip layout
zipinfo -1 ./restore/demo.zip | head -n 20
```

---

## 📄 License

MIT © Daniil V (RestlessByte) — <https://github.com/RestlessByte>  
