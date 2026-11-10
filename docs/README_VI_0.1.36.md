# HakiSend Publisher Obsidian 0.1.36 — Website + Email

## Thay đổi

- Tạm **ẩn và khóa gửi Facebook**: không còn lệnh Facebook, không chọn Page trong Plan mới, không gọi Facebook API từ Calendar. Mã cũ vẫn được giữ để bảo toàn khả năng đọc các kế hoạch lịch sử, không chuyển kế hoạch Facebook đã lưu sang lệnh gửi mới.
- Giữ **Calendar Website** trực tiếp trong Obsidian.
- Thêm lệnh **HakiSend: Calendar Website + Email (lịch native trên HakiSend)**: mở `rui/publisher-email/calendar?type=all&view=month` trong trình duyệt (cần phiên đăng nhập HakiSend). Đây là Calendar chung trên server, hiển thị Post và email native đã đặt lịch; chỉ đọc, không gửi.
- Giữ Calendar kế hoạch cục bộ Website + Post Free Email + Email Only để kiểm tra dự định; mục Facebook của kế hoạch cũ không còn hiển thị trong lịch này.
- Giữ Calendar API đọc thử nghiệm v1/v2 trong plugin; chưa khẳng định lịch native email đã hợp nhất trong lưới Obsidian.
- Chỉ một Email List trong Plan mới; Plan cũ vẫn giữ nguyên file.
- Phần email Post Notice vẫn phải được kiểm tra guest Free trên server trước khi gửi.

## Cài trên KIENVU

Giải nén ZIP vào một thư mục riêng (không giải nén đè thư mục bản cũ) và chạy `bash INSTALL_KIENVU.sh` từ thư mục giải nén. Script kiểm tra cả hai Vault, backup `main.js`, `manifest.json`, `styles.css`, không động đến `data.json`, không SSH hoặc thay đổi VPS. Nếu phiên bản trên máy đã khác 0.1.34/0.1.35/0.1.36 thì script **dừng**.

Reload Obsidian/Community Plugin sau khi cài.

## Chưa coi là bản phát hành Community mới

Đây là bản **candidate kiểm thử nội bộ**. Cần thêm server attestation chính xác cho trích đoạn guest của Post bị bảo vệ, UAT một người nhận, Calendar hợp nhất trong Obsidian, kiểm tra Cloud Sync/HTML entities, QA package trước khi nâng bản trên GitHub Community Plugin.
