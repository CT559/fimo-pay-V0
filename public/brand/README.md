# fimoPAY — Brand Assets

Thả file ảnh của bạn vào đúng thư mục này, đặt tên chính xác như bên dưới.
App sẽ tự dùng ngay khi có file — không cần sửa code.

## Files cần có

| File | Dùng cho | Khuyến nghị |
|------|----------|-------------|
| `logo-full.png` | Header (logo + chữ fimoPAY ngang) | PNG nền trong suốt, rộng ~240px, cao ~56px |
| `logo-icon.png` | App icon nhỏ, favicon fallback | PNG vuông 64×64 hoặc 128×128 |
| `banner.png` | Hero card trên màn hình Home | PNG/JPG tỉ lệ 16:9, rộng ~640px |

## Vị trí hiển thị

```
/public/brand/
  logo-full.png   ← header app
  logo-icon.png   ← corner icon nhỏ
  banner.png      ← hero section (tuỳ chọn)
```

## Nếu muốn dùng SVG

Đặt `logo-full.svg` và `logo-icon.svg` thay cho `.png` — cập nhật đuôi file trong
`src/components/FimoLogo.tsx` (dòng `SRC_FULL` và `SRC_ICON`).
