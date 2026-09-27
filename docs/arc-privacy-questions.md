# fimoPAY × Arc Privacy Sector (APS) — Câu hỏi cho Arc Team

**Ngày:** Tháng 9/2026
**Dự án:** fimoPAY — hạ tầng thanh toán machine commerce trên Arc
**Liên hệ:** [tên/email của bạn]

---

## Bối cảnh

fimoPAY xử lý 2 loại giao dịch có yêu cầu privacy cao:

1. **Thanh toán dịch vụ** (trạm sạc EV, bãi đỗ xe, vending machine, siêu thị):
   Số tiền giao dịch hiện public on-chain → bất kỳ ai cũng biết ai đang sạc xe ở đâu, mua gì, lúc mấy giờ.

2. **Kiều hối** (lao động xuất khẩu gửi tiền về quê):
   Số tiền và địa chỉ người nhận hiện public → rủi ro tracking tài chính cá nhân.

Docs APS nêu "Privacy features are on the roadmap and not yet available on Arc" —
mình cần hiểu lộ trình cụ thể để thiết kế đúng ngay từ đầu, tránh chắp vá sau.

---

## Câu hỏi chính

### 1. Lộ trình & Thời gian

- APS dự kiến available trên testnet và mainnet vào thời điểm nào?
- Có beta/early access program nào cho builders không?
  fimoPAY sẵn sàng tham gia pilot nếu có.

### 2. Scope tích hợp

- Để gọi `SettlementRouterV1.settle()` với private amount (ẩn số tiền),
  contract đó có cần deploy lại trong APS không, hay có thể gọi cross-boundary
  từ public EVM vào APS contract?
- "Synchronous composability" trong docs nghĩa là public contract
  có thể gọi APS contract trong cùng 1 transaction không?
  Nếu có: public `SettlementRouter` → private `amount` → public token transfer
  — flow này có khả thi không?

### 3. Selective disclosure

- Sau khi giao dịch private, user có thể prove amount cho bên thứ 3
  (ví dụ: cơ quan thuế, ngân hàng) mà không expose on-chain không?
  Cơ chế cụ thể là gì (ZK proof, viewing key, hay khác)?

### 4. Compliance & AML

- Với giao dịch private, fimoPAY vẫn cần AML screening
  (Chainalysis/TRM Labs). APS có cơ chế cho phép compliance oracle
  access private amount không, mà không làm lộ với public?

### 5. Gas

- Gas cho APS transaction trả bằng USDC (như public EVM) không?
- Chi phí ước tính so với public transaction chênh lệch bao nhiêu?

### 6. Tooling

- APS có tương thích với Foundry (forge test, forge deploy) không?
- Solidity code có cần modifier đặc biệt (như `@private`) hay chỉ cần
  deploy vào APS endpoint?

---

## Phương án tạm thời (đang dùng, trình bày để nhận feedback)

Trong khi chờ APS, fimoPAY đang dùng 2 biện pháp bảo vệ privacy mức ứng dụng:

1. **Aggregate display**: UI chỉ hiển thị tổng giao dịch theo ngày/tuần,
   không hiển thị từng giao dịch cụ thể với địa chỉ ví.
2. **Amount rounding**: Số tiền hiển thị làm tròn đến $0.10 trong UI
   (số chính xác vẫn on-chain — đây là UX không phải privacy thật sự).

**Câu hỏi bổ sung**: Với giai đoạn hiện tại (chưa có APS),
Arc team có khuyến nghị approach nào khác để bảo vệ privacy tốt hơn không?
Ví dụ: stealth addresses, commit-reveal scheme, hay mixer-style batching?

---

## Câu hỏi ngắn thêm (nếu có thời gian)

- StableFX (JPYC/KRW1/PHPC): timeline deploy lên Arc testnet dự kiến?
  fimoPAY cần để test luồng kiều hối thật sự.
- Arc Builders Fund / Microgrants: fimoPAY ở giai đoạn này
  có đủ điều kiện apply không? Quy trình ra sao?
- Opt-in privacy có áp dụng cho native USDC transfer không,
  hay chỉ cho contract execution?

---

*Cảm ơn Arc team. fimoPAY được xây dựng hoàn toàn trên Arc
vì tin tưởng vào vision USDC-as-gas và sub-second finality
phù hợp với machine commerce. Rất mong nhận được hướng dẫn.*
