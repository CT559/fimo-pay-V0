# FIMO — Phân tích kỹ thuật toàn diện từ góc độ Arc Studio

> Ngày đánh giá: 21/09/2026  
> Cơ sở: đặc tả FIMO v.cuối (9 trang) + toàn bộ kho kỹ thuật Arc Studio (use-arc, use-gateway, use-modular-wallets, bridge-stablecoin, contracts, onchain-facts, onchain-money, onchain-wait)

---

## I. ĐIỂM TỐT — Nền tảng vững chắc, quyết định thiết kế sắc sảo

### 1. Kiến trúc Smart Contract Layer (Mục 5) — Xuất sắc
- **17 file, 57 contract, 4 bộ test độc lập PASS** là một nền tảng hiếm thấy ở giai đoạn pre-demo.
- **Adapter pattern nhất quán**: `IFXConverter`, `IFXOracle`, `IComplianceScreener` — mọi phần "chưa biết" đều được thiết kế sẵn như khe cắm (plug-in slot). Khi StableFX thật có API, chỉ cần viết adapter implement interface, không chạm logic lõi. Đây là cách tốt nhất để xử lý vendor-lock và thông tin còn trống.
- **UUPS Upgradeable đúng chỗ**: chỉ `SettlementRouter` — phần logic có khả năng cần vá — mới upgradeable. `IssuerRegistry`, `ComplianceGateway` dùng admin function thay vì proxy, tránh surface attack thừa.
- **`batchSettle()` generic theo token**: không hard-code quốc gia hay token vào logic, hoàn toàn nhất quán với mục 3.1. Thêm Đài Loan hay bất kỳ nước nào chỉ cần `addIssuer()`.
- **Cơ chế hạn mức "đề xuất → chờ → tự động chốt"**: pattern `LIMIT_INCREASE_DELAY` trong `ComplianceGateway.sol` rất đúng về bảo mật (time-lock với cancel window). Nhất quán khi áp cho cả wallet recovery (mục 3.5) — đây là thiết kế có triết lý xuyên suốt, không phải ghép vá.
- **EIP-712 Device Attestation**: chống giả mạo dữ liệu đo lường đúng chuẩn, test đủ 5 kịch bản (hợp lệ, chữ ký giả, dữ liệu bị sửa, replay, thiết bị bị khóa).
- **SessionEscrow không lock tiền**: thanh toán atomic tức thời — đúng với Arc (sub-second finality). Nếu escrow thật sự lock tiền sẽ tạo ra UX tệ và MEV surface.

### 2. Phạm vi đã thu hẹp đúng cách (Mục 3)
- Loại bỏ taxi/quán cà phê/nhà hàng (provider cá nhân, không có trọng tài tự động) là quyết định kỹ thuật đúng — tranh chấp trong các dịch vụ đó không thể tự động hóa an toàn.
- 5 dịch vụ còn lại đều có thiết bị cố định có thể ký số (EIP-712) hoặc flow người dùng khởi tạo (kiều hối) — đều implement được sạch.

### 3. Wallet Recovery có triết lý nhất quán (Mục 3.5)
- 24–48h delay + cancel window + escalation lock là mô hình đúng với SIM-swap attack.
- Việc đồng bộ với `LIMIT_INCREASE_DELAY` thay vì tạo cơ chế mới là thiết kế có tư duy hệ thống tốt.

### 4. Tiered Verification (Mục 6.1)
- 3 tier (Universal OTP SIM → Telco eKYC → Global KYC bên thứ 3) là mô hình thực tế, không over-engineer.

---

## II. ĐIỂM CHƯA TỐT / CẦN KHẮC PHỤC

### NHÓM A — Lỗ hổng kỹ thuật cần giải quyết ngay (trước khi build tiếp)

#### A1. `ReentrancyGuardTransient` trong `SettlementRouterV1.sol` — RỦI RO CAO
**Vấn đề**: Contract dùng `ReentrancyGuardTransient` (EIP-1153 transient storage, Cancun opcode). Tuy nhiên Arc Studio xác nhận Arc EVM target là **Paris** (`evm_version = "paris"` trong `foundry.toml`). Cancun/EIP-1153 **không có trong Paris**.

**Hậu quả**: Contract hiện tại **không compile được trên Arc thật** khi deploy với EVM version Paris. Đây là lỗi blocking.

**Cách khắc phục**:
```solidity
// Thay thế:
// import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
// contract SettlementRouterV1 is ReentrancyGuardTransient

// Bằng:
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
contract SettlementRouterV1 is ReentrancyGuardUpgradeable {
    function initialize(...) public initializer {
        __ReentrancyGuard_init();
    }
}
```
> Lưu ý: Đây chính xác là câu hỏi mở số 6 trong mục 11 — câu trả lời là **KHÔNG**, Arc không hỗ trợ Cancun/EIP-1153, cần thay ngay.

#### A2. OpenZeppelin version — Rủi ro compile với `contracts 5.6.1`
**Vấn đề**: Tài liệu ghi dùng OpenZeppelin `contracts 5.6.1` + `contracts-upgradeable 5.6.0`. Từ OZ **5.2.0**, `utils/Bytes.sol` dùng opcode `mcopy` (Cancun-only). Các contract như `Strings.sol`, `Math.sol`, `ERC721`, `ERC4626`, `Governor` import `Bytes.sol` — **không compile được với Paris EVM target của Arc**.

**Cách khắc phục**: Pin về **OpenZeppelin 5.1.0** (phiên bản mà Arc Studio sandbox đang dùng, đã kiểm chứng Paris-compatible). Nếu đang test với Hardhat có thể compile bình thường nhưng khi deploy thật lên Arc sẽ bị từ chối.

#### A3. Idempotency cho `batchSettle()` — Pending item số 2 trong mục 8
**Vấn đề**: Nếu agent gọi `batchSettle()` trùng lặp (network retry, double-submit), người dùng bị trừ tiền 2 lần. Đây là lỗ hổng nghiêm trọng với thanh toán tự động.

**Cách khắc phục**: Thêm mapping `settledSessions` (sessionId → bool) trong `SettlementRouter`, revert nếu đã settled. Hoặc kết hợp `SessionEscrow` để sessionId chỉ SETTLED một lần.

#### A4. UsageAttestation chưa được khâu nối vào SettlementRouter — Pending item số 1 trong mục 8
**Vấn đề**: Hiện tại `SettlementRouter.batchSettle()` chấp nhận `totalUSD` từ agent mà không đối chiếu với `attestedUsageBySession` từ `UsageAttestation.sol`. Agent có thể khai man số tiền.

**Cách khắc phục**: Trong `batchSettle()`, với mỗi session của 4 dịch vụ thiết bị, gọi `UsageAttestation.getAttestedUsage(sessionId)` và require `totalUSD <= attestedUsage + toleranceBPS`. Kiều hối bỏ qua bước này (đúng như thiết kế).

#### A5. Auto-refund chưa có — Pending item số 3 trong mục 8
**Vấn đề**: 4 dịch vụ thiết bị (sạc điện, đỗ xe, vending, siêu thị) cần cơ chế hoàn tiền khi session bị hủy mid-use (điện mất, máy kẹt hàng, v.v.). Không có auto-refund = tiền mắc kẹt.

**Cách khắc phục**: Thêm trạng thái `CANCELLED` vào `SessionEscrow` + hàm `cancelSession(sessionId)` chỉ gọi được bởi device owner hoặc sau timeout. `SettlementRouter` cần `refundSession()` tương ứng.

---

### NHÓM B — Lỗ hổng kiến trúc ảnh hưởng đến khả năng vận hành thật

#### B1. USDC là native gas trên Arc — Cần xử lý đặc biệt trong frontend và contract
**Vấn đề**: Trên Arc, USDC native (18 decimals) và USDC ERC-20 (6 decimals, `0x3600...`) là **cùng một pool tiền**, không phải 2 tài sản riêng biệt. Tài liệu không đề cập điều này.

**Rủi ro cụ thể**:
- Nếu frontend hiện thị cả `useBalance()` (native, 18 dec) lẫn `balanceOf()` ERC-20 (6 dec) là **double-count** cùng một số tiền.
- Nếu contract dùng `msg.value` cho native USDC và cũng `transferFrom()` ERC-20 USDC trong cùng transaction là double-charge.
- `PriceMath.sol` cần xử lý đúng: khi tính toán trên Arc, các amount từ `msg.value` phải convert qua `gasTokenToUsdc()` trước khi so sánh với ERC-20 amounts.

**Cách khắc phục**: Trong frontend dùng `@/onchain-money` của Arc Studio:
```typescript
import { parseUsdc, formatUsdc, usdcToGasToken, gasTokenToUsdc } from '@/onchain-money';
import { getUsdc } from '@/onchain-facts';
// Chỉ dùng ERC-20 view cho balance hiển thị và transfer
// Không bao giờ cộng native balance + ERC-20 balance
```

#### B2. Luồng kiều hối — Chưa có thiết kế cụ thể (Pending item số 4, Open Question số 10)
**Vấn đề**: Dịch vụ quan trọng nhất (kiều hối) chưa có thiết kế màn hình và chưa rõ cách xác thực người nhận.

**Đề xuất từ Arc Studio** (dựa trên khả năng thật của hệ thống):
- **Người nhận**: chỉ cần địa chỉ ví (không cần thêm KYC bổ sung phía người nhận nếu amount dưới threshold). Có thể dùng phone → address lookup nếu cả hai bên dùng FIMO.
- **Giới hạn kiều hối**: nên có `remittanceLimit` riêng trong `ComplianceGateway` ngoài `dailyLimit` chung — kiều hối thường có amount lớn hơn và tần suất thấp hơn.
- **Xác nhận người nhận**: hiển thị ENS/alias nếu có, hiển thị 3 ký tự đầu + 4 cuối của địa chỉ, yêu cầu user confirm trước khi settle.

#### B3. FX Engine — StableFX chưa có API, Mock đang che khuất rủi ro giá
**Vấn đề**: `MockFXEngine.sol` trả về tỷ giá cố định. Trong production, tỷ giá fluctuate, slippage phải được bound.

**Đề xuất**:
- Thêm `maxSlippageBPS` parameter vào `batchSettle()`.
- Contract từ chối settle nếu tỷ giá thực tế (từ `IFXOracle`) lệch quá `maxSlippageBPS` so với tỷ giá agent quote.
- Open Question số 2 (StableFX API) và số 3 (Oracle giá chính thức Arc) cần được trả lời trước khi testnet thật.

#### B4. Waterfall Settlement — Thiếu race condition protection
**Vấn đề**: Khi agent tính waterfall (chọn stablecoin, tính tỷ giá), đến khi contract execute có thể:
- Balance đã thay đổi (user chi tiêu parallel)
- Tỷ giá đã thay đổi (giữa lúc agent quote và lúc execute)

**Cách khắc phục**:
- Contract cần check balance tại thời điểm execute, không tin vào số agent báo cáo.
- Thêm `deadline` parameter vào `batchSettle()` — revert nếu block.timestamp > deadline (tương tự Uniswap's deadline).
- Đã thiết kế đúng hướng ("Contract tự kiểm tra lại độc lập") nhưng cần implement cụ thể.

---

### NHÓM C — Wallet SDK và 2FA — Trả lời Open Questions 7, 8, 12

#### C1. Lựa chọn SDK ví tối ưu (Open Question 7, 8, 12)
**Dựa trên khả năng thật của Arc Studio**, khuyến nghị **Circle Modular Wallets** (ưu tiên hàng đầu) vì:
- **Passkey (WebAuthn) là 2FA tự nhiên**: đáp ứng mục 3.3 mà không cần thêm layer riêng.
- **Hỗ trợ Arc Testnet và Mainnet**: xác nhận trong `use-modular-wallets` skill.
- **Gas Station (paymaster)**: người dùng không cần hold USDC riêng cho gas — USDC gas trên Arc được sponsor.
- **BIP-39 recovery**: SDK có sẵn `references/passkey-recovery.md` — trả lời trực tiếp Open Question 12 (delayed recovery có thể xây trên BIP-39 recovery flow).
- **Lazy deployment**: MSCA chỉ deploy khi có transaction đầu tiên — không tốn gas tạo ví.

**Passkey là 2FA layer thứ 2 cho mục 3.3**:
- Layer 1: Phone OTP (SIM-based)
- Layer 2: Passkey (thiết bị-bound, WebAuthn) — browser tự xử lý biometrics (Face ID, fingerprint)

**Recovery flow cho mục 3.5** với Modular Wallets:
- Dùng BIP-39 mnemonic như recovery backup.
- Pending recovery state: tự build một `PendingRecovery` contract nhỏ (giống `PersonalLimit` trong `ComplianceGateway`) ghi nhận request + 24–48h timelock.
- Cancel channel: email notification + BIP-39 holder có thể cancel.

**Cấu hình cần thiết trước khi code**:
```
VITE_CLIENT_KEY=     # Lấy từ Circle Console → Keys → Client Keys
VITE_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl
Passkey Domain: i6ht1xa2su8vcwk53mofp.preview.studio.arc.io (session hiện tại)
```

#### C2. 2FA trong Settings — Cần tách flow rõ hơn
**Vấn đề**: Mục 3.3 yêu cầu 2FA khi tạo ví, nhưng mục 3.4 đặt `setMyDailyLimit()` trong Settings. Hai hành động này có security level khác nhau.

**Đề xuất**:
- Tạo ví: passkey (WebAuthn) là 2FA chính.
- Thay đổi limit trong Settings: yêu cầu passkey xác nhận lại trước khi gọi `setMyDailyLimit()`.
- Recovery request: cần cả phone OTP mới + passkey xác nhận (hoặc email) để gửi pending recovery.

---

### NHÓM D — Tích hợp Arc ecosystem — Trả lời Open Questions 1–6

#### D1. Địa chỉ contract thật trên Arc (Open Question 1)
Arc Studio có thể confirm:
- **USDC trên Arc**: `0x3600000000000000000000000000000000000000` (cả testnet lẫn mainnet, fixed predeploy).
- **EURC trên Arc Mainnet**: `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`.
- **EURC trên Arc Testnet**: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`.
- **JPYC, KRW1, PHPC**: cần verify tại https://docs.arc.io/arc/references/contract-addresses — đây là stablecoin nội địa bên thứ 3, địa chỉ có thể thay đổi.

#### D2. Nạp USDC vào Arc (Open Question 4) — Đã có câu trả lời rõ ràng
**Circle App Kit / Bridge Kit qua CCTP** là con đường chính thức, permissionless, không cần xin quyền. Arc Studio có toàn bộ skill `bridge-stablecoin` bao gồm:
- CCTP domain của Arc: **26** (cả testnet lẫn mainnet).
- `kit.bridge({ from: "Base_Sepolia", to: "Arc_Testnet", amount, token: "USDC" })` — một lệnh, full lifecycle.
- Fast mode: ~8–20 giây. Standard mode: ~15–19 phút.

**Không cần xin quyền StableFX trước** — bridge qua CCTP là đủ để demo và testnet.

#### D3. Network params chính xác (Open Question 5) — Đã biết
| | Arc Mainnet | Arc Testnet |
|---|---|---|
| Chain ID | 5042 | 5042002 |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| CCTP Domain | 26 | 26 |

#### D4. Arc có hỗ trợ Cancun/EIP-1153 không? (Open Question 6)
**KHÔNG** — Arc EVM target là Paris. `ReentrancyGuardTransient` không dùng được. Xem A1 ở trên.

#### D5. Compliance/AML (Open Question 9)
- **Testnet**: không bắt buộc, dùng `MockComplianceScreener` là đủ.
- **Mainnet với tiền thật**: bắt buộc tích hợp ít nhất 1 trong 3 vendor. **TRM Labs** thường là lựa chọn cost-effective nhất cho dự án giai đoạn early. Đặt `screener` qua `setScreener()` — đã thiết kế sẵn.

---

### NHÓM E — Web App Layer — Thiếu hoàn toàn, cần xây từ đầu

#### E1. Cần xây mới (Pending item số 7)
Theo tài liệu, chưa có:
- Web App (React/Vite — đã có sandbox sẵn trong Arc Studio).
- Luồng tạo ví 2FA.
- Màn hình Thanh toán (1 nút).
- Màn hình Kiều hối.
- Màn hình Cài đặt (hạn mức).
- Agent Backend (Node.js).

**Thứ tự build được đề xuất**:
1. Smart Contract fixes (A1–A5) → build lại → deploy testnet.
2. Web App skeleton + Circle Modular Wallets (tạo ví + passkey).
3. Màn hình Thanh toán (connect đến SettlementRouter).
4. Màn hình Kiều hối.
5. Màn hình Cài đặt (hạn mức).
6. Agent Backend (waterfall logic).
7. Bridge USDC vào Arc (CCTP/App Kit).

#### E2. Thiếu xử lý đặc thù Arc trong frontend patterns
Arc Studio có module `@/onchain-facts`, `@/onchain-money`, `@/onchain-wait` sinh sẵn trong sandbox. FIMO phải dùng các module này thay vì tự viết:
```typescript
// ĐÚNG — dùng Arc Studio modules
import { getUsdc, requireChain } from '@/onchain-facts';
import { parseUsdc, formatUsdc } from '@/onchain-money';
import { waitForSuccessfulTransaction } from '@/onchain-wait';

// SAI — tự viết
const USDC_ADDRESS = "0x3600..."; // hardcode
const parsed = parseUnits(amount, 6); // tự viết
```

---

### NHÓM F — Điểm mở còn lại (vẫn cần thông tin bên ngoài)

| # | Câu hỏi | Trạng thái |
|---|---|---|
| Q2 | StableFX API chi tiết | Vẫn cần contact Circle/Arc team |
| Q7 | SDK ví final choice | **Khuyến nghị: Circle Modular Wallets** (đã trả lời) |
| Q8 | 2FA cụ thể | **Khuyến nghị: Passkey (WebAuthn)** (đã trả lời) |
| Q9 | AML timing | **Testnet: skip. Mainnet: TRM Labs** (đã trả lời) |
| Q10 | Thiết kế luồng kiều hối | **Đề xuất: address-only, remittanceLimit riêng** (đã trả lời) |
| Q11 | Builder grants Arc | Xem https://docs.arc.io — Arc Builders Fund, Microgrants |
| Q12 | Delayed recovery SDK | **Circle Modular Wallets BIP-39 + custom timelock contract** (đã trả lời) |

---

## III. TỔNG KẾT

### Điểm mạnh cốt lõi
FIMO có một smart contract layer **tốt hơn hầu hết dự án hackathon** ở cùng giai đoạn — adapter pattern, tiered verification, time-lock security, UUPS upgrade đúng chỗ, test coverage đầy đủ. Đây là nền tảng đáng để xây tiếp, không cần rewrite.

### Việc phải làm ngay (blocking)
1. Thay `ReentrancyGuardTransient` → `ReentrancyGuardUpgradeable` (A1 — không compile được trên Arc).
2. Pin OpenZeppelin về 5.1.0 (A2 — Paris EVM compatibility).
3. Implement idempotency cho `batchSettle()` (A3 — double-charge risk).
4. Khâu nối `UsageAttestation` vào `SettlementRouter` (A4 — agent có thể khai man).

### Việc cần làm trước mainnet
5. Auto-refund cho 4 dịch vụ thiết bị (A5).
6. Slippage bound trong waterfall (B3, B4).
7. USDC native vs ERC-20 handling đúng cách trong frontend (B1).
8. StableFX adapter thật (B3) — cần contact Circle team.

### Lựa chọn kiến trúc được đề xuất (từ Arc Studio)
- **Ví**: Circle Modular Wallets (passkey = 2FA tự nhiên + BIP-39 recovery).
- **Bridge vào Arc**: Circle App Kit qua CCTP (permissionless, ~10s fast mode).
- **Oracle**: Chainlink hoặc oracle chính thức của Arc khi có.
- **AML testnet**: skip. AML mainnet: TRM Labs.
- **Frontend**: Vite + React (đã sẵn trong Arc Studio sandbox) + wagmi v2 + ConnectKit.
