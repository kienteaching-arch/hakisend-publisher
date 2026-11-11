# HakiSend Publisher Obsidian 0.1.36 — Website + Email

## Thay đổi

- Tạm **ẩn và khóa gửi Facebook**: không còn lệnh Facebook, không chọn Page trong Plan mới, không gọi Facebook API từ Calendar. Mã cũ vẫn được giữ để bảo toàn khả năng đọc các kế hoạch lịch sử, không chuyển kế hoạch Facebook đã lưu sang lệnh gửi mới.
- Giữ **Calendar Website** trực tiếp trong Obsidian.
- Thêm lệnh **HakiSend: Calendar Website + Email (lịch native trên HakiSend)**: mở `rui/publisher-email/calendar?type=all&view=month` trong trình duyệt (cần phiên đăng nhập HakiSend). Đây là Calendar chung trên server, hiển thị Post và email native đã đặt lịch; chỉ đọc, không gửi.
- Giữ Calendar kế hoạch cục bộ Website + Post Free Email + Email Only để kiểm tra dự định; mục Facebook của kế hoạch cũ không còn hiển thị trong lịch này.
- Giữ Calendar API đọc thử nghiệm v1/v2 trong plugin; chưa khẳng định lịch native email đã hợp nhất trong lưới Obsidian.
- Chỉ một Email List trong Plan mới; Plan cũ vẫn giữ nguyên file.
- Phần email Post Notice vẫn phải được kiểm tra guest Free trên server trước khi gửi.

## Cài UAT trên KIENVU

Gói nội bộ ban đầu có script `INSTALL_KIENVU.sh` cập nhật **cả hai vault**. Để kiểm thử phiên bản chuẩn bị phát hành Community, **không dùng lại script đó**. Gói UAT mới có script `scripts/uat-install-kienvu-test-vault.sh`, chỉ nhắm vault **HakiSend-Test**; chạy `--preflight` trước, sau đó mới cân nhắc `--install`. Script lưu backup 3 tệp runtime và không sửa `data.json`, không SSH hoặc thay đổi VPS.

Xem [checklist UAT và cách cài an toàn](UAT_KIENVU_0.1.36.md). Reload Obsidian/Community Plugin sau khi cài.

## Chưa coi là bản phát hành Community mới

Đây là bản **candidate kiểm thử nội bộ**. Cần thêm server attestation chính xác cho trích đoạn guest của Post bị bảo vệ, UAT một người nhận, Calendar hợp nhất trong Obsidian, kiểm tra Cloud Sync/HTML entities, QA package trước khi nâng bản trên GitHub Community Plugin.
