# fimoPAY — Hướng dẫn chạy trên Windows PowerShell

## Yêu cầu tối thiểu

| Công cụ | Phiên bản | Cài ở đâu |
|---------|-----------|-----------|
| Node.js | 20 LTS trở lên | https://nodejs.org → chọn LTS |
| Git | bất kỳ | https://git-scm.com/download/win |
| Bun | 1.x | cài bằng lệnh bên dưới |
| Foundry | bất kỳ | cài bằng lệnh bên dưới (chỉ cần compile/test contract) |

---

## BƯỚC 1 — Cài Bun (một lần duy nhất)

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Sau khi cài xong, **đóng PowerShell và mở lại** để PATH có hiệu lực.
Kiểm tra:

```powershell
bun --version
```

---

## BƯỚC 2 — Tải code về máy (chọn 1 trong 2 cách)

### Cách A — Clone từ GitHub (sau khi đã push)

```powershell
git clone https://github.com/TEN_CUA_BAN/fimo-app.git
cd fimo-app
```

### Cách B — Tải ZIP từ Arc Studio

Nhấn nút **Download Code** trong panel Code của Arc Studio,
giải nén, rồi:

```powershell
cd C:\Users\TEN_BAN\Downloads\fimo-app
```

---

## BƯỚC 3 — Cài dependencies

```powershell
bun install
```

Lệnh này tải toàn bộ thư viện Node vào `node_modules/`.
Chỉ cần chạy 1 lần (hoặc khi `bun.lock` thay đổi).

---

## BƯỚC 4 — Chạy app Web (dev mode)

```powershell
bun run dev
```

Mở trình duyệt và truy cập: **http://localhost:5173**

Để dừng: nhấn `Ctrl + C` trong PowerShell.

---

## BƯỚC 5 — Compile Smart Contracts (cần Foundry)

### Cài Foundry (một lần duy nhất)

```powershell
# Tải installer
curl -L https://foundry.paradigm.xyz -o foundryup.ps1

# Chạy installer
powershell -ExecutionPolicy Bypass -File foundryup.ps1
```

Đóng và mở lại PowerShell, kiểm tra:

```powershell
forge --version
```

### Compile contracts

```powershell
bun run contracts:build
```

### Chạy test contracts

```powershell
bun run contracts:test
```

---

## BƯỚC 6 — Thêm logo thương hiệu

Sao chép file logo của bạn vào thư mục `public\brand\`:

```powershell
# Ví dụ — thay đường dẫn thực tế của bạn
Copy-Item "C:\Users\TEN_BAN\Desktop\logo-full.png"  "public\brand\logo-full.png"
Copy-Item "C:\Users\TEN_BAN\Desktop\logo-icon.png"  "public\brand\logo-icon.png"
Copy-Item "C:\Users\TEN_BAN\Desktop\banner.png"     "public\brand\banner.png"
```

App tự nhận ngay — không cần restart dev server.
Xem `public\brand\README.md` để biết kích thước khuyến nghị.

---

## BƯỚC 7 — Build production (trước khi deploy Vercel/Netlify)

```powershell
bun run build
```

File tĩnh xuất ra thư mục `dist\`. Đây là thứ Vercel/Netlify deploy.

---

## BƯỚC 8 — Push lên GitHub

```powershell
# Khởi tạo repo (chỉ lần đầu)
git init
git add .
git commit -m "feat: fimoPAY initial release"
git branch -M main

# Tạo repo mới trên github.com rồi copy URL, ví dụ:
git remote add origin https://github.com/TEN_CUA_BAN/fimo-app.git
git push -u origin main

# Các lần sau chỉ cần:
git add .
git commit -m "fix: mo ta thay doi"
git push
```

---

## BƯỚC 9 — Deploy lên Vercel

### Cách nhanh nhất — kéo thả từ GitHub

1. Vào https://vercel.com → **New Project**
2. Import repo `fimo-app` từ GitHub
3. Cài đặt:
   - **Framework Preset**: Vite
   - **Build Command**: `bun run build`
   - **Output Directory**: `dist`
4. Nhấn **Deploy** — xong trong ~1 phút

### Cách dùng CLI

```powershell
# Cài Vercel CLI (một lần)
npm install -g vercel

# Deploy (lần đầu sẽ hỏi đăng nhập)
vercel

# Các lần sau (deploy production)
vercel --prod
```

---

## BƯỚC 10 — Deploy lên Netlify (tuỳ chọn)

```powershell
# Cài Netlify CLI (một lần)
npm install -g netlify-cli

# Đăng nhập
netlify login

# Deploy
netlify deploy --build --prod
```

---

## Tóm tắt lệnh hàng ngày

```powershell
# Chạy app để xem thay đổi
bun run dev

# Kiểm tra lỗi code (lint + typecheck)
bun run check

# Compile contracts
bun run contracts:build

# Test contracts
bun run contracts:test

# Build production
bun run build

# Commit và push lên GitHub
git add .
git commit -m "mo ta thay doi"
git push
```

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `bun: command not found` | Chưa cài hoặc PATH chưa load | Đóng mở lại PowerShell sau khi cài Bun |
| `forge: command not found` | Chưa cài Foundry | Chạy lại bước cài Foundry, đóng mở lại PowerShell |
| `Cannot find module` | Chưa `bun install` | Chạy `bun install` |
| Port 5173 đã dùng | App khác đang chiếm | `bun run dev -- --port 5174` |
| Logo không hiện | File chưa đúng tên/thư mục | Đặt đúng tên theo `public\brand\README.md` |
