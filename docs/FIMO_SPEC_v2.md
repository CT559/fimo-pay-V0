# fimoPAY — Đặc tả dự án v2.0
> Bản cập nhật sau lần build đầu tiên trên Arc Studio. Phản ánh trạng thái thực tế của code + contract + UX đã hoàn thiện.
> Ngày cập nhật: 23 tháng 9 năm 2026

---

## 1. Tổng quan

**Tên sản phẩm:** fimoPAY  
**Định nghĩa:** Hạ tầng thanh toán machine commerce — thiết bị tự đo lường, tự tính tiền, khách bấm 1 nút xác nhận. Đồng thời cung cấp dịch vụ chuyển tiền về quê cho lao động xuất khẩu.  
**Blockchain:** Arc (Layer-1 của Circle) — USDC là native gas token  
**Mạng hiện tại:** Arc Testnet (Chain ID: 5042002)  
**Triết lý UX:** Không dùng thuật ngữ crypto. Không animation gây ấn tượng. Không real-time feed. Màu sắc pass phép thử Wise/Revolut.

---

## 2. Phạm vi — 6 quốc gia, 5 dịch vụ

### 2.1 Quốc gia và token nhận

| Quốc gia | Token nhận (kiều hối) | Trạng thái token |
|----------|-----------------------|-----------------|
| Việt Nam | USDC | Live trên Arc |
| Thái Lan | USDC | Live trên Arc |
| Đài Loan | USDC | Live trên Arc |
| Nhật Bản | JPYC | Announced — chưa có địa chỉ contract (Sep 2026) |
| Hàn Quốc | KRW1 | Announced — chưa có địa chỉ contract (Sep 2026) |
| Philippines | PHPC | Announced — chưa có địa chỉ contract (Sep 2026) |

**Nguyên tắc cứng:** Bên gửi LUÔN gửi USDC. Agent Waterfall convert sang token đích ở hậu trường. Logic nghiệp vụ không hard-code quốc gia — chỉ khác token theo `RECEIVER_TOKEN` map trong `contracts.ts`.

### 2.2 Dịch vụ

| # | Tên | Icon | Áp dụng Device Attestation |
|---|-----|------|----------------------------|
| 1 | Trạm sạc EV | Xe + tia sạc | Có (EIP-712) |
| 2 | Bãi đỗ xe thông minh | Biển P | Có (EIP-712) |
| 3 | Máy bán hàng tự động | Tủ kính + sản phẩm | Có (EIP-712) |
| 4 | Tự thanh toán siêu thị | Màn hình + barcode | Có (EIP-712) |
| 5 | Chuyển tiền về quê | Mũi tên + đồng tiền | Không (không có thiết bị đo) |

**Đã loại bỏ vĩnh viễn:** xe ôm/taxi, quán cà phê, nhà hàng — lý do: provider là cá nhân, không có trọng tài khách quan để tự động hóa tranh chấp/hoàn tiền.

---

## 3. Kiến trúc 4 tầng

```
┌─────────────────────────────────────────────────────┐
│ TẦNG 1 — THIẾT BỊ (Device / IoT)                   │
│ Đo lường real-time, ký số EIP-712 trước khi gửi    │
└─────────────────────────────────────────────────────┘
                    │ WebSocket (dữ liệu đã ký)
                    ▼
┌─────────────────────────────────────────────────────┐
│ TẦNG 2 — AGENT (off-chain, Node.js/Python)          │
│ Xác minh chữ ký, tính Waterfall, gọi batchSettle() │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ TẦNG 3 — SMART CONTRACT (Solidity, Arc Testnet)     │
│ SettlementRouterV1 + 6 contract phụ trợ — LIVE      │
└─────────────────────────────────────────────────────┘
                    ▲
┌─────────────────────────────────────────────────────┐
│ TẦNG 4 — APP (Web — Vite + React + TypeScript)      │
│ 4 màn hình: Home, Thanh toán, Gửi tiền, Cài đặt   │
└─────────────────────────────────────────────────────┘
```

---

## 4. Smart Contract Layer — đã deploy trên Arc Testnet

**Stack:** Solidity 0.8.24, OpenZeppelin 5.1.0 (Paris-safe), Foundry, evm_version: paris

### 4.1 Contracts đã deploy

| Contract | Địa chỉ Arc Testnet | Vai trò |
|----------|---------------------|---------|
| IssuerRegistry | `0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985` | Danh mục stablecoin — `addIssuer()` để thêm token mới không cần redeploy |
| ComplianceGateway | `0xe72a17930539045989e5a0c10736b47ce1bb0e5d` | 3-tier KYC + daily limit tự cài đặt + AML screener adapter |
| SessionEscrow | `0x8b209ee7061481be3605a7c988fda70cf0548663` | Vòng đời phiên OPEN → SETTLED (ghi nhận, không khóa tiền) |
| DeviceRegistry | `0x1f1c901536c81a5871a27bb381be0d34487ee5f4` | Đăng ký thiết bị IoT được phép ký dữ liệu |
| UsageAttestation | `0xdfeb8e0b0ad692d7698b84da8a0eb6e8703d3a3e` | EIP-712 — xác minh dữ liệu đo lường từ thiết bị |
| SettlementRouterV1 (impl) | `0xcc8c78eb2f33b71c11a7ee0d05b3eeb53b1bcb0a` | Logic lõi UUPS — batchSettle() cho cả 5 dịch vụ |
| FimoProxy (ERC1967) | `0xd70b8c9a1b61f1c9ebb79803ae6a610add0be34a` | Proxy đã initialized — điểm vào duy nhất cho frontend |
| MockFXOracle | `0x...` | Oracle tỷ giá tạm thời (interface IFXOracle) |
| MockFXEngine | `0x...` | FX engine tạm thời (interface IFXConverter) |

**Token thật đang dùng:**
- USDC: `0x3600000000000000000000000000000000000000` (6 decimals, Arc native)
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (6 decimals)

### 4.2 Blocking fixes đã áp dụng

| Vấn đề | Fix đã thực hiện |
|--------|-----------------|
| `ReentrancyGuardTransient` dùng EIP-1153 (Cancun-only) | Thay bằng `ReentrancyGuardUpgradeable` từ OZ 5.1.0 |
| OpenZeppelin 5.2+ dùng opcode `mcopy` (Cancun-only) | Pin về **OZ 5.1.0** |
| `batchSettle()` chưa idempotent | Thêm `sessionNonce` mapping chống double-settle |
| `UsageAttestation` chưa khâu nối vào `SettlementRouter` | Đối chiếu `attestedUsageBySession` với `totalUSD` trước settle |

### 4.3 Adapter pattern — khe cắm thay thế độc lập

```
IFXConverter  → MockFXEngine     → StableFX (khi có API access)
IFXOracle     → MockFXOracle     → Chainlink/Arc native oracle
IComplianceScreener → disabled   → Chainalysis/Elliptic/TRM Labs
```

Thay adapter không cần sửa `SettlementRouterV1` — chỉ gọi `setFxConverter()` / `setScreener()`.

---

## 5. Frontend App

**Stack:** Vite + React 18 + TypeScript, Wagmi v2, ConnectKit, Tailwind CSS v3, Framer Motion, Lucide React, @web3icons/react

### 5.1 Màn hình

| Tab | Tên | Nội dung chính |
|-----|-----|----------------|
| Home | Tổng quan | Hero card + 4 service cards + remittance banner + KYC onboarding |
| Payment | Thanh toán | Chọn dịch vụ + QR scanner + số tiền + approve→settle 2 bước |
| Remittance | Gửi tiền | Chọn quốc gia + số tiền + địa chỉ người nhận + xác nhận |
| Settings | Cài đặt | Hạn mức/ngày + số dư ví + cấp KYC + bảo mật 2FA |

### 5.2 Design tokens

**Light mode (default):**
- Nền: gradient wave xanh trắng tái tạo brand fimoPAY (`#c8e8ff → #e8f4ff → #f5faff`)
- Accent: `#1a6fff` (fimoPAY blue)
- Glass card: `rgba(255,255,255,0.72)` + blur 28px
- Ink: `#0b1e38`

**Dark mode:**
- Nền: `#07111e` + glow xanh
- Accent: `#4da3ff`
- Glass card: `rgba(255,255,255,0.06)`
- Toggle: icon Sun/Moon ở header, tự nhận `prefers-color-scheme`

**Fonts:** Space Grotesk (display/số lớn) + DM Sans (body/UI) + JetBrains Mono (địa chỉ/hash)

### 5.3 i18n — 7 ngôn ngữ

| Code | Ngôn ngữ | Quốc gia |
|------|----------|----------|
| `vi` | Tiếng Việt | Việt Nam |
| `en` | English | Global |
| `fil` | Filipino | Philippines |
| `ja` | 日本語 | Nhật Bản |
| `ko` | 한국어 | Hàn Quốc |
| `th` | ภาษาไทย | Thái Lan |
| `zh` | 繁體中文 | Đài Loan |

**Nguyên tắc ngôn ngữ:** Cấm hoàn toàn thuật ngữ crypto trong UI. "Số tài khoản" thay cho "wallet address". "Giao dịch đã xử lý" thay cho "on-chain transaction". Người dùng không cần biết JPYC hay KRW1 — chỉ thấy kết quả.

### 5.4 Logo & Brand

- **File:** `public/brand/logo-full.png` (icon vuông bên trái)
- **Chữ fimoPAY:** Hardcoded trong `FimoLogo.tsx` — "fimo" navy + "PAY" xanh accent. Không thay đổi được dù thay file ảnh.
- **Dark mode:** `filter: brightness(1.12)` trên icon + chữ đổi màu adaptive

### 5.5 Tính năng nổi bật

**QR Scanner:** Dùng `BarcodeDetector` API (Chrome/Android). Fallback: nhập địa chỉ thủ công. Chỉ mở camera khi user bấm nút — không autostart.

**Waterfall Settlement:**
```
Agent quét số dư → xếp hạng tỷ giá → dùng token tốt nhất trước
→ bù phần thiếu bằng token tiếp theo
→ Contract xác minh lại độc lập trước khi execute
```

**Daily Limit với time-lock:**
- Giảm hạn mức: hiệu lực ngay
- Tăng hạn mức: chờ 24h (cùng pattern với wallet recovery)
- Cài đặt qua màn hình Settings, không xuất hiện trên luồng thanh toán

**Wallet Recovery (SIM swap protection):**
1. Xác thực lại tại nhà mạng (ngoài phạm vi kỹ thuật FIMO)
2. Pending recovery — KHÔNG cấp quyền ngay
3. Time-lock 24-48h + thông báo qua 2FA channel
4. Có thể hủy trong thời gian chờ
5. Tự động có hiệu lực nếu không ai hủy

---

## 6. Bảo mật & Xác thực

### 6.1 Tiered Verification

| Tier | Tên | Điều kiện | Hạn mức |
|------|-----|-----------|---------|
| 0 | Chưa xác minh | Mới tạo tài khoản | Xem, không giao dịch |
| 1 | Xác minh SĐT | OTP SIM | Cơ bản |
| 2 | eKYC nhà mạng | Tên đăng ký SIM khớp CCCD/hộ chiếu | Nâng cao |
| 3 | KYC đầy đủ | CCCD + hộ chiếu + sao kê 3 tháng gần nhất (hoặc hóa đơn điện/nước) | Không giới hạn |

### 6.2 2FA

- **Passkey** (WebAuthn): sinh trắc học thiết bị (Face ID / vân tay) — đang hoạt động
- **Google Authenticator**: TOTP 6 số, đổi mỗi 30 giây — sắp ra mắt

### 6.3 Ví MPC

Ưu tiên Circle Modular Wallets (passkey + số điện thoại). Fallback: Biconomy/Privy/Dynamic/Turnkey (10 providers đã xác nhận tương thích Arc).

---

## 7. Token trên Arc Testnet

| Token | Địa chỉ | Decimals | Trạng thái |
|-------|---------|----------|-----------|
| USDC | `0x3600000000000000000000000000000000000000` | 6 | **Live** |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | **Live** |
| USYC | `0xe918...b86C` | 6 | Live (KYC tổ chức) |
| JPYC | — | 18 | Announced only |
| KRW1 | — | 0 | Announced only |
| PHPC | — | 6 | Announced only |

**Lưu ý quan trọng về Arc:** Trên Arc, USDC native (18 dec) và USDC ERC-20 (6 dec) là CÙNG một pool tiền. Frontend dùng `@/onchain-money` để xử lý — không tự viết decimal conversion.

---

## 8. Tech Stack đầy đủ

| Tầng | Công nghệ |
|------|-----------|
| Blockchain | Arc Testnet/Mainnet — Chain ID 5042002 |
| Smart Contract | Solidity 0.8.24, OZ 5.1.0, Foundry, evm: paris |
| Chain interaction | ethers.js v6 (backend), viem + wagmi v2 (frontend) |
| Device signature | EIP-712, ECDSA |
| Agent backend | Node.js/Python (chưa build) |
| Wallet/Identity | Circle Modular Wallets (passkey, BIP-39 recovery) |
| 2FA | Passkey (live) + Google Authenticator (sắp ra mắt) |
| Compliance/AML | Adapter sẵn — tích hợp Chainalysis/Elliptic/TRM Labs khi cần |
| USDC onramp | Circle CCTP / Bridge Kit (permissionless) |
| FX Engine | MockFXEngine (testnet) → StableFX khi có API access |
| Frontend | Vite 5 + React 18 + TypeScript, Tailwind CSS v3 |
| UI libs | Framer Motion, Lucide React, @web3icons/react, Sonner |
| Wallet UI | ConnectKit + Wagmi v2 |
| i18n | Custom — 7 ngôn ngữ, 100+ keys |
| Deployment | Vercel (frontend) / Netlify |

---

## 9. Trạng thái tiến độ

### Đã hoàn thành

- [x] Smart contract layer (17 files, 57 contracts, 4 bộ test PASS)
- [x] Deploy 9 contracts lên Arc Testnet
- [x] ERC1967Proxy + initialize() cho SettlementRouterV1
- [x] Frontend Web App (4 màn hình, dark mode, 7 ngôn ngữ)
- [x] QR scanner (BarcodeDetector API)
- [x] Copy địa chỉ ví
- [x] Multi-token balance (USDC live + EURC live + partner tokens coming soon)
- [x] Daily limit UI (Settings)
- [x] KYC onboarding flow UI
- [x] brand fimoPAY: nền wave, logo adaptive, hardcoded wordmark
- [x] Test giao dịch thật: 1 USDC gửi thành công trên Arc Testnet
  - Tx: `0xfa6306d4a5978e8acce2f833a0ad3a0c2143c41263703eb53720bff240c269dc`

### Pending — giai đoạn 2

- [ ] Agent Backend (Node.js) — Waterfall engine + Gemini API cho biên nhận
- [ ] Kết nối UsageAttestation với SettlementRouter (4 dịch vụ thiết bị)
- [ ] Auto-refund cho 4 dịch vụ thiết bị
- [ ] Circle CCTP/Bridge Kit integration thật
- [ ] StableFX adapter (khi có API access)
- [ ] JPYC/KRW1/PHPC — thêm địa chỉ khi issuer deploy lên Arc
- [ ] Google Authenticator TOTP
- [ ] Circle Modular Wallets (passkey onboarding cho production)
- [ ] KYC Tier 2/3 backend verification flow
- [ ] iOS/Android (React Native) — sau khi web hoàn thiện
- [ ] Liên kết tài khoản ngân hàng nội địa (Circle Payouts API — giai đoạn 3)

---

## 10. Open Questions còn lại

1. **StableFX API:** Phạm vi cặp tiền tệ hỗ trợ, điều kiện/quy trình được cấp quyền truy cập, ABI/cách gọi RFQ
2. **JPYC/KRW1/PHPC trên Arc:** Thời điểm deploy — theo dõi tại https://builtonarc.app
3. **Agent Backend design:** Cách Gemini API sinh biên nhận thân thiện người dùng từ raw tx data
4. **Circle Builder Program:** Microgrants, Developer Grants, Arc Builders Fund — điều kiện nộp hồ sơ
5. **Luồng kiều hối — xác thực người nhận:** Chỉ cần địa chỉ ví, hay cần thêm lớp định danh? Có giới hạn số tiền/tần suất riêng ngoài daily limit chung?

---

## 11. Nguyên tắc UX không thay đổi

1. **Không dùng thuật ngữ crypto** trong UI — "số tài khoản", "giao dịch đã xử lý", "phí giao dịch"
2. **Animation chỉ để làm rõ** — checkmark + số tiền confirm là đủ. Không particle flow.
3. **Số liệu cộng đồng nếu có:** Con số tĩnh tuần/tháng. Tuyệt đối không real-time feed.
4. **Màu sắc pass phép thử Wise/Revolut** — không dùng màu/icon chỉ xuất hiện trên Binance/MetaMask
5. **Onboarding:** "Nhập số điện thoại để bắt đầu" — không "Connect your wallet", không hình ảnh portal/cổng không gian

---

*Tài liệu này phản ánh trạng thái thực tế của codebase tại commit ngày 23/09/2026. Cập nhật tiếp khi giai đoạn 2 bắt đầu hoặc khi Open Questions được trả lời.*
