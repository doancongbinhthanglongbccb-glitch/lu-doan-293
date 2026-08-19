# Hướng dẫn quản trị — CBQuiz Lữ đoàn 293

Tài liệu dành cho admin vận hành hệ thống ôn tập / Kiểm tra. Truy cập: `/admin` (tài khoản role `admin`, đã duyệt).

---

## 1. Đăng nhập lần đầu

| Mục | Giá trị mặc định |
|-----|------------------|
| Số quân nhân | `00000001` |
| Mật khẩu | Giá trị `ADMIN_PASSWORD` trong `backend/.env` **trước khi** chạy `npm run migrate` |

Sau migrate, đổi mật khẩu qua **Quản lý người dùng → Đã duyệt → Reset mật khẩu** nếu cần.

---

## 2. Giá trị cấu hình mặc định (Giai đoạn 5 — đã rà)

Các giá trị dưới đây nằm trong `backend/src/config/constants.js` và `database/schema.sql`. Admin có thể đổi một số mục qua **Cài đặt**; các mục còn lại chỉ đổi qua code / migrate.

| Cấu hình | Mặc định | Ghi chú |
|----------|----------|---------|
| Số câu / bộ (Ôn tập tổng hợp) | **30** | `practice_mixed_question_count` — Lưu cài đặt sẽ tái tạo N bộ |
| Số bộ N (Ôn tập tổng hợp) | **5** | `practice_mixed_set_count` — dùng chung mọi user |
| Buffer thời gian Kiểm tra | **30 phút** | `exam_time_buffer_minutes` — không cho bắt đầu nếu còn ít hơn (duration + buffer) trước giờ đóng đợt |
| Tiêu đề hệ thống | Hệ thống ôn tập trắc nghiệm | `quiz_meta.title` |
| Tiểu đoàn mặc định (migration) | Chưa phân loại | Ẩn khỏi đăng ký (`is_active=0`) |
| JWT access | 1 giờ | `.env` `JWT_ACCESS_EXPIRES` |
| JWT refresh | 7 ngày | `.env` `JWT_REFRESH_EXPIRES` |
| Số QN | 8 chữ số | Validate khi đăng ký |
| Mật khẩu tối thiểu | 6 ký tự | Validate khi đăng ký |
| Trùng câu giữa các bộ đề (engine) | ≤ **50%** | Trên 50% bị loại khi sinh bộ; hết retry vẫn giữ bộ fallback |
| Độ sâu cây chủ đề (CTE) | **32** | Chặn treo khi `parent_id` tạo chu trình |

**Khuyến nghị vận hành:** Giữ 30 câu × 5 bộ và buffer 30 phút trừ khi có yêu cầu đơn vị. Đổi số câu/bộ hoặc số bộ **reset tiến độ** Ôn tập tổng hợp của toàn bộ lính.

---

## 3. Quy trình vận hành theo tab

### 3.1 Quản lý câu hỏi

1. **Import Excel** theo mẫu (Trắc nghiệm / Điền khuyết / Tự luận ngắn).
2. Chỉnh sửa chủ đề cây (nhóm lớn → con → lá). **Lĩnh vực Kiểm tra** = chủ đề gốc (`parent_id IS NULL`) có câu trong cây con.
3. Sau khi sửa ngân hàng câu hỏi, các đợt Kiểm tra **draft/đóng** có thể được đánh dấu *Cần tái tạo*; khi **Mở đợt** admin sẽ được hỏi xác nhận tái tạo bộ đề.

### 3.2 Quản lý người dùng

1. Duyệt / từ chối tài khoản **Chờ duyệt**.
2. Gán **Tiểu đoàn** cho user (dropdown thấy cả tiểu đoàn ẩn).
3. Lọc theo tiểu đoàn khi cần rà soát.

Lính **phải** thuộc tiểu đoàn active mới đăng ký được; **phải** có `battalion_id` mới vào được đợt Kiểm tra của tiểu đoàn đó.

### 3.3 Cài đặt

- **Dashboard đăng ký:** số user / tiểu đoàn + **đã thi Kiểm tra ≥ 1 lần**, điểm TB / cao / thấp (chỉ tính `exam_results`).
- **Ôn tập tổng hợp:** số câu/bộ, số bộ N, nút **Tái tạo bộ**.
- **Buffer Kiểm tra** (phút).
- **CRUD tiểu đoàn:** ẩn/hiện trên form đăng ký; xóa chỉ khi 0 user.

### 3.4 Đợt kiểm tra

Trong tab **Đợt kiểm tra** có 3 sub-tab (mặc định: Quản lý đợt):

1. **Quản lý đợt**
   - **+ Tạo đợt:** chọn một hoặc nhiều tiểu đoàn, số câu/bộ, số bộ, thời gian làm bài, giờ mở — đóng.
   - **Mở đợt:** sinh bộ đề cho **cả** nhánh Theo lĩnh vực (từng lĩnh vực gốc đủ câu) **và** Trộn tổng hợp (nếu pool đủ). Một tiểu đoàn không được nằm trong 2 đợt `open` cùng lúc.
   - **Đóng đợt:** lính không bắt đầu mới; bài đang làm auto-submit khi hết giờ đợt.
   - **Tái tạo đề** (draft/đóng): xóa assignment cũ, sinh lại bộ.
2. **Tiến độ:** chọn đợt → bảng Tiểu đoàn × (từng lĩnh vực + Trộn). Ô = `đã hoàn thành / quân số approved`. Ô **—** = lĩnh vực chưa sinh đề trong đợt đó.
3. **Lịch sử Kiểm tra:** lọc tiểu đoàn, nhánh (tất cả / lĩnh vực / trộn), tìm theo số QN hoặc họ tên. Chỉ kết quả từ bảng `exam_results`.

Link cũ `#panelHistory` vẫn mở đúng sub-tab Lịch sử Kiểm tra.

---

## 4. Luồng lính (tham chiếu khi hỗ trợ)

| Chế độ | Mô tả |
|--------|--------|
| Ôn tập từng phần | Chọn chủ đề lá, làm tự do, có đáp án ngay |
| Ôn tập tổng hợp | Chọn **Bộ 1…N** cố định, tiến độ riêng từng user |
| Kiểm tra | Luôn thấy nút; vào được khi có đợt mở cho tiểu đoàn + đúng giờ → chọn **Lĩnh vực / Trộn** → chọn **Bộ** → làm 1 lần / nhánh / đợt |
| Lịch sử Kiểm tra | 2 tab: Theo lĩnh vực / Trộn — chỉ kết quả của chính mình |
| Ôn câu sai | Tự ghi nhận khi làm sai (ôn / kiểm tra) |

---

## 5. Checklist kiểm thử end-to-end (Giai đoạn 5)

Chạy trên môi trường dev (`npm run migrate` + `npm run dev`), ít nhất 2 tiểu đoàn và 2 user approved.

### Auth & tiểu đoàn

- [ ] Đăng ký user mới → chọn tiểu đoàn active → trạng thái **pending**
- [ ] Admin duyệt + gán tiểu đoàn → user đăng nhập được
- [ ] User rejected / pending không vào `/quiz`

### Ngân hàng câu hỏi

- [ ] Import Excel vào chủ đề → số câu tăng trên dashboard admin
- [ ] Export / Import round-trip không mất câu

### Ôn tập tổng hợp

- [ ] User A chọn Bộ 1, trả lời vài câu → thanh tiến độ tăng
- [ ] User B cùng bộ → tiến độ **không** dính User A
- [ ] Admin đổi số bộ / tái tạo → tiến độ reset

### Kiểm tra — admin

- [ ] Tạo đợt 2 tiểu đoàn, mở → có bộ theo lĩnh vực + trộn (nếu đủ câu)
- [ ] Mở đợt thứ 2 trùng tiểu đoàn → **báo lỗi**
- [ ] Ma trận: chọn đợt → ô lĩnh vực chưa sinh đề = **—**; đã có kết quả = `X/Y`

### Kiểm tra — lính

- [ ] Trước giờ mở / không có đợt → toast, ở Home
- [ ] Trong giờ: Lĩnh vực → chọn topic → chọn Bộ → làm → nộp → điểm server-side
- [ ] Cùng nhánh / đợt làm lại → **bị chặn**
- [ ] Trộn tổng hợp: luồng tương tự
- [ ] Hết giờ đợt khi đang làm → auto-submit

### Lịch sử & báo cáo

- [ ] Lính: Lịch sử Kiểm tra — 2 tab, chỉ thấy bài của mình
- [ ] Admin: Lịch sử Kiểm tra — filter tiểu đoàn + nhánh + tên
- [ ] Dashboard đăng ký: sau khi có kết quả Kiểm tra → cột đã thi / điểm cập nhật

### Unit test tự động

```bash
cd backend && npm test
```

Kỳ vọng: **17/17 pass** (engine sinh đề, tiến độ ôn tổng hợp, pool topic CTE).

---

## 6. Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|-------------|------------------------|--------|
| Lính không thấy Kiểm tra (vào được nhưng không có đợt) | Tiểu đoàn không thuộc đợt `open` hoặc chưa tới `opens_at` | Kiểm tra tab Đợt kiểm tra + giờ hệ thống |
| “Không đủ thời gian làm bài” | Còn ít hơn `duration + buffer` trước `closes_at` | Mở rộng giờ đóng hoặc giảm buffer |
| “Bạn không được gán bộ đề” | User duyệt sau khi đợt đã mở (assignment chưa có) | Chốt nghiệp vụ: tái mở / gán thủ công (chưa có UI) |
| Lĩnh vực trống trên ma trận (—) | Pool câu lĩnh vực đó trống lúc mở đợt | Bổ sung câu hỏi, tái tạo/mở lại đợt |
| Ôn tập tổng hợp mất tiến độ | Admin đổi cài đặt hoặc tái tạo bộ | Thông báo trước cho lính khi đổi cấu hình |

---

## 7. Tài liệu liên quan

- [API.md](./API.md) — REST endpoints
- [DATABASE.md](./DATABASE.md) — schema SQLite
- [DEPLOY.md](./DEPLOY.md) — triển khai production
