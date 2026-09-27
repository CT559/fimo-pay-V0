# FIMO — Hướng dẫn chạy local, push GitHub, deploy Vercel

## 1. Yêu cầu cài đặt trên máy

| Công cụ | Version | Link tải |
|---------|---------|----------|
| Node.js | 18+ | https://nodejs.org |
| Bun | latest | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| Foundry | latest | https://book.getfoundry.sh/getting-started/installation |
| Git | latest | https://git-scm.com |
| MetaMask | latest | https://metamask.io |

---

## 2. Clone code về máy (từ Arc Studio)

Nhấn nút **Download Code** trên giao diện Arc Studio để tải file ZIP, sau đó giải nén.
Hoặc nếu đã push lên GitHub (xem bước 4), clone về:

```powershell
git clone https://github.com/YOUR_USERNAME/fimo-app.git
cd fimo-app
```

---

## 3. Cài dependencies và chạy local

Mở PowerShell trong thư mục dự án:

```powershell
# Cài tất cả dependencies
bun install

# Chạy dev server (mở http://localhost:5173)
bun run dev
```

Mở trình duyệt: **http://localhost:5173**

### Cấu hình MetaMask cho Arc Testnet:
- Network name: **Arc Testnet**
- RPC URL: **https://rpc.testnet.arc.io**
- Chain ID: **5042002**
- Currency: **USDC**
- Explorer: **https://explorer.testnet.arc.io**

Nhận USDC testnet miễn phí: https://faucet.circle.com

---

## 4. Build smart contracts

```powershell
# Kiểm tra build (cần Foundry cài sẵn)
bun run contracts:build

# Chạy tests
bun run contracts:test
```

### Deploy contracts lên Arc Testnet:

```powershell
# Đặt private key vào .env (KHÔNG commit file này!)
echo "PRIVATE_KEY=0x_your_private_key_here" > .env
echo "ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io" >> .env

# Deploy IssuerRegistry
forge create contracts/IssuerRegistry.sol:IssuerRegistry \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $env:PRIVATE_KEY

# Deploy ComplianceGateway (thay <OWNER_ADDRESS>)
forge create contracts/ComplianceGateway.sol:ComplianceGateway \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $env:PRIVATE_KEY \
  --constructor-args <OWNER_ADDRESS>

# Deploy SessionEscrow
forge create contracts/SessionEscrow.sol:SessionEscrow \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $env:PRIVATE_KEY

# Deploy DeviceRegistry
forge create contracts/DeviceRegistry.sol:DeviceRegistry \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $env:PRIVATE_KEY

# Deploy SettlementRouterV1 (UUPS proxy)
# Bước 1: Deploy implementation
forge create contracts/upgradeable/SettlementRouterV1.sol:SettlementRouterV1 \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $env:PRIVATE_KEY

# Sau khi deploy xong, ghi lại các địa chỉ contract vào AGENTS.md
```

---

## 5. Wiring địa chỉ contract vào frontend

Sau khi deploy, tạo file `.env` (KHÔNG commit):

```env
VITE_COMPLIANCE_GATEWAY=0x...
VITE_SETTLEMENT_ROUTER=0x...
VITE_ISSUER_REGISTRY=0x...
VITE_SESSION_ESCROW=0x...
VITE_DEVICE_REGISTRY=0x...
```

Frontend đọc qua `import.meta.env.VITE_*`.

---

## 6. Push lên GitHub

```powershell
# Khởi tạo git (nếu chưa có)
git init
git add .
git commit -m "feat: FIMO machine commerce dApp on Arc"

# Tạo repo mới trên github.com rồi:
git remote add origin https://github.com/YOUR_USERNAME/fimo-app.git
git branch -M main
git push -u origin main
```

---

## 7. Deploy lên Vercel

### Cách 1: Qua Vercel CLI (PowerShell)

```powershell
# Cài Vercel CLI
bun add -g vercel

# Login
vercel login

# Deploy (lần đầu)
vercel

# Deploy production
vercel --prod
```

Vercel sẽ tự detect Vite và build với `bun run build`.

### Cách 2: Qua Vercel Dashboard (dễ hơn)

1. Vào **https://vercel.com/new**
2. Import từ GitHub repo vừa push
3. Framework: **Vite** (Vercel tự detect)
4. Build command: `bun run build`
5. Output directory: `dist`
6. Thêm Environment Variables (nếu có VITE_*)
7. Nhấn **Deploy**

### Cài đặt Vercel cho Vite SPA:
File `vercel.json` đã có sẵn trong project, xử lý client-side routing.

---

## 8. Cấu trúc thư mục quan trọng

```
fimo-app/
├── contracts/                    # Smart contracts (Solidity 0.8.24)
│   ├── IssuerRegistry.sol        # Danh mục stablecoin 6 nước
│   ├── ComplianceGateway.sol     # KYC tiers + hạn mức cá nhân
│   ├── SessionEscrow.sol         # Vòng đời phiên thanh toán
│   ├── DeviceRegistry.sol        # Đăng ký thiết bị IoT
│   ├── UsageAttestation.sol      # Chữ ký EIP-712 từ thiết bị
│   ├── upgradeable/
│   │   └── SettlementRouterV1.sol  # Contract lõi UUPS upgradeable
│   ├── interfaces/               # IFXOracle, IFXConverter, IComplianceScreener
│   ├── mocks/                    # Mock cho test local
│   └── libraries/
│       └── PriceMath.sol
├── src/
│   ├── App.tsx                   # App shell + navigation
│   ├── components/
│   │   ├── PaymentScreen.tsx     # 4 dịch vụ IoT
│   │   ├── RemittanceScreen.tsx  # Kiều hối 6 quốc gia
│   │   └── SettingsScreen.tsx    # Hạn mức + KYC tier
│   ├── onchain-facts.ts          # Arc chain/USDC facts
│   └── onchain-money.ts          # USDC amount helpers
├── docs/
│   ├── deploy-guide.md           # File này
│   └── fimo-analysis.md          # Phân tích điểm mạnh/yếu
├── vercel.json                   # Vercel SPA routing
└── foundry.toml                  # Solidity config (Paris EVM)
```

---

## 9. Lưu ý quan trọng

- **KHÔNG commit `.env`** — đã có trong `.gitignore`
- Arc Testnet dùng **USDC làm gas** — cần USDC testnet để trả phí (không phải ETH)
- `ReentrancyGuardTransient` đã được thay thế bằng `ReentrancyGuardUpgradeable` (Paris EVM compatible)
- `@openzeppelin/contracts-upgradeable@5.1.0` đã pin — không nâng lên 5.2.x+ (Cancun-only)
- Các Mock contracts chỉ dùng cho test local — không deploy lên mainnet

---

## 10. Troubleshooting

| Lỗi | Giải pháp |
|-----|-----------|
| `bun: command not found` | Cài Bun: `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| `forge: command not found` | Cài Foundry: `cargo install --git https://github.com/foundry-rs/foundry` |
| MetaMask "Wrong Network" | Thêm Arc Testnet thủ công (xem bước 3) |
| "Insufficient USDC for gas" | Nhận testnet USDC tại faucet.circle.com |
| Vercel build fail | Kiểm tra `bun run build` chạy được local trước |
