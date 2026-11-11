# Obsidian Publisher 0.1.36 — UAT trên KIENVU (chưa phát hành)

**Phạm vi:** Chỉ vault thử nghiệm `/home/kienvu/HakiSend-Test/HakiSend-Test`. Không ghi đè vault KIENOS, không chỉnh VPS và không gửi email trong bước cài đặt.

## A. Cài vào vault thử nghiệm

1. Đóng Obsidian hoàn toàn trên máy KIENVU.
2. Giải nén bản ZIP UAT vào thư mục riêng, giữ `main.js`, `manifest.json`, `styles.css` ở gốc ZIP và script trong `scripts/`.
3. Mở Terminal trong thư mục vừa giải nén và chạy **chỉ kiểm tra**:

   ```bash
   bash scripts/uat-install-kienvu-test-vault.sh --preflight
   ```

4. Chỉ khi nhận `RESULT=OBSIDIAN_0136_TEST_VAULT_PREFLIGHT_PASS` mới chạy:

   ```bash
   bash scripts/uat-install-kienvu-test-vault.sh --install
   ```

5. Ghi lại đường dẫn `BACKUP=`. Script chỉ thay 3 tệp runtime; giữ nguyên `data.json`. Nếu máy đang dùng phiên bản ngoài dải 0.1.34–0.1.36 hoặc có tệp/symlink bất thường, script dừng và không cài.
6. Mở vault **HakiSend-Test** trong Obsidian, vào Settings → Community plugins và bật/tắt rồi bật lại HakiSend Publisher (nếu cần).

## B. Checklist UAT

| ID | Thao tác | Kết quả mong đợi | Trạng thái |
| --- | --- | --- | --- |
| UAT-01 | Mở vault thử nghiệm, kiểm tra plugin v0.1.36 | Tải thành công, không có lỗi khởi động | Chờ |
| UAT-02 | Mở Settings và Command Palette, tìm HakiSend | Giữ cấu hình đăng nhập cũ, không có lệnh Facebook gửi mới | Chờ |
| UAT-03 | Mở Website Calendar cục bộ | Lịch Post hiển thị, không thay đổi lịch đã có | Chờ |
| UAT-04 | Mở Website + Email Calendar trên server | Mở trong trình duyệt đăng nhập HakiSend; không tự gửi | Chờ |
| UAT-05 | Soạn kế hoạch Email Only và Post-linked Free trên vault thử nghiệm | Chỉ chọn một List; không tự gửi; trường thông tin đúng | Chờ |
| UAT-06 | Kiểm tra Post Notice dùng Post được bảo vệ | Server xác nhận guest Free teaser trước khi cho gửi | Chờ xác nhận backend |
| UAT-07 | Một người nhận thử nghiệm duy nhất, sau khi duyệt UAT-06 | Receipt và Delivery Journal xác nhận chính xác một lần gửi, không retry mù | Chờ duyệt gửi |
| UAT-08 | Kiểm tra xung đột revision, Cloud Sync/HTML entities | Không tạo bản trùng, không mất nội dung, hành vi lỗi rõ ràng | Chờ |
| UAT-09 | Kiểm tra trên Obsidian Mobile | Mở được plugin và UI cần thiết, hoặc ghi nhận rõ giới hạn thực tế | Chờ thiết bị |

**Lưu ý:** UAT-01 đến UAT-05 nên thao tác trên nội dung thử nghiệm, chưa Publish Now, chưa Send và chưa Schedule trên HakiSend production. UAT-06 đến UAT-08 cần kiểm tra backend và một email thử nghiệm do chủ tài khoản chủ động cho phép. Khi server trả kết quả chưa xác định, đối chiếu receipt/journal trước khi quyết định thử lại.

## C. Thu thập kết quả

- Gửi lại `RESULT=` của script và các mục UAT `PASS/FAIL` kèm mô tả/screenshot nếu lỗi.
- **Không** gửi `data.json`, access token, OAuth code, mật khẩu, danh sách email thật hoặc toàn bộ log chứa thông tin cá nhân.
- Nếu cần quay lại bản trước, đóng Obsidian, lưu bản `BACKUP=` và xác minh đúng 3 tệp cũ trước khi khôi phục; không xóa `data.json`.

## D. Điều kiện tiếp theo

Chỉ khi UAT đạt và rà soát chính sách Community Plugins hoàn tất mới xem xét GitHub Release `0.1.36`, merge PR và gửi PR vào danh mục Obsidian. CI xanh không thay thế UAT thực tế.
