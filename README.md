# Hệ thống ôn tập trắc nghiệm

Ứng dụng web **vanilla JavaScript** phục vụ ôn thi và quản trị ngân hàng câu hỏi cho **Lữ đoàn 293**.

Không cần build, không framework — chạy qua HTTP server tĩnh.

---

## Tính năng

### Người dùng (`index.html`)

| Chế độ | Mô tả |
|--------|--------|
| **Ôn tập từng phần** | Ôn theo từng chủ đề (hiện khi có ≥ 2 chủ đề) |
| **Ôn tập tổng hợp** | Gộp toàn bộ câu hỏi |
| **Thi thử** | Chọn số câu + thời gian, có đếm ngược, nộp bài xem kết quả |
| **Ôn tập các câu sai** | Lọc câu đã trả lời sai (theo chủ đề, số lần sai tối thiểu) |

**Luồng ôn tập:** chọn/nhập đáp án → bấm **Nộp đáp án** → hiện đúng/sai một lần (không hiện ngay khi chọn).

**Thi thử:** chọn đáp án xuyên suốt, nộp cả bài mới chấm điểm và xem phân tích.

Hỗ trợ loại câu: trắc nghiệm, nhiều đáp án, đúng/sai, điền khuyết, tự luận. Công thức toán qua **MathJax**.

### Xác thực (`login.html`, `register.html`)

- Đăng nhập bằng **số quân nhân** (8 chữ số) + mật khẩu
- Đăng ký → trạng thái `pending`, chờ Admin duyệt
- Chỉ tài khoản `approved` mới đăng nhập được
- Phân quyền `admin` / `user`

### Quản trị (`admin.html`)

**Quản lý câu hỏi**
- CRUD chủ đề và câu hỏi
- Import / Export Excel (SheetJS)
- Tải mẫu Excel theo chủ đề
- Xóa hết câu hỏi trong một chủ đề

**Quản lý người dùng**
- Tab Chờ duyệt / Đã duyệt
- Duyệt, từ chối, sửa, reset mật khẩu, xóa user
- Tìm kiếm theo số quân nhân hoặc họ tên

---

## Chạy ứng dụng

> **Bắt buộc** chạy qua HTTP server. Không mở trực tiếp file `file://` (fetch JSON/Excel sẽ lỗi).

```cmd
cd TSQCB
npm start
```

Mở trình duyệt: **http://localhost:8080/login.html**

### Nếu lỗi `'npm' is not recognized`

Node có thể đã cài nhưng chưa có trong PATH:

```cmd
"C:\Program Files\nodejs\npx.cmd" serve -l 8080
```

Hoặc dùng Python:

```cmd
python -m http.server 8080
```

Sau đó vào `http://localhost:8080/login.html`.

---

## Tài khoản mặc định

| Số quân nhân | Mật khẩu | Vai trò |
|--------------|----------|---------|
| `00000001`   | `admin123` | Admin |

Seed từ `data/users.json`. User mới đăng ký qua `register.html` cần Admin duyệt.

---

## Cấu trúc thư mục

```
TSQCB/
├── login.html              # Đăng nhập
├── register.html           # Đăng ký
├── index.html              # Trang ôn thi (user)
├── admin.html              # Trang quản trị
├── css/
│   └── style.css
├── js/
│   ├── config.js           # Hằng số, storage keys, loại câu hỏi
│   ├── utils.js            # Tiện ích: shuffle, chấm điểm, DOM $
│   ├── storage.js          # LocalStorage + load JSON
│   ├── auth.js             # Auth & quản lý user (API)
│   ├── auth-page.js        # Logic trang login/register
│   ├── excel.js            # Import/export Excel
│   ├── app.js              # Logic ôn thi
│   └── admin.js            # Logic admin
├── data/
│   ├── questions.json      # Ngân hàng câu hỏi mặc định (seed)
│   ├── users.json          # User mặc định (seed)
│   └── *.xlsx              # Mẫu Excel import (Quân sự, Chính trị, …)
├── assets/                 # Logo, banner
└── imports/                # Thư mục phụ cho file import (tùy chọn)
```

### Thứ tự load script

**User:** `config → utils → storage → excel → auth → app`

**Admin:** `config → utils → storage → excel → auth → admin` (+ SheetJS CDN)

**Login/Register:** `config → storage → auth → auth-page`

---

## Lưu trữ dữ liệu

Toàn bộ dữ liệu runtime nằm trong **LocalStorage** của trình duyệt (theo từng máy / trình duyệt).

| Key LocalStorage | Nội dung |
|------------------|----------|
| `TSQCB_quiz_data` | Câu hỏi + chủ đề (ưu tiên khi load) |
| `TSQCB_users_data` | Danh sách người dùng |
| `TSQCB_current_user` | Phiên đăng nhập hiện tại |
| `TSQCB_wrong_history_<militaryId>` | Lịch sử câu sai theo user |
| `TSQCB_correct_history_<militaryId>` | Lịch sử câu đúng (ôn câu sai) |

### Luồng load câu hỏi

1. Có `TSQCB_quiz_data` trong LocalStorage → **dùng bản này**
2. Chưa có → fetch `data/questions.json`
3. Admin sửa / import Excel → ghi lại LocalStorage (**không** ghi ngược file JSON trên disk)

### Reset dữ liệu

DevTools → **Application** → **Local Storage** → xóa key tương ứng.

- Xóa `TSQCB_quiz_data` → nạp lại từ `questions.json` (nếu file tồn tại)
- Xóa `TSQCB_users_data` → nạp lại từ `users.json`

---

## Import Excel (Admin)

Tên file `.xlsx` = tên chủ đề khi import (merge/ghi đè theo tên).

| Loại | Cột |
|------|-----|
| **Trắc nghiệm** | Câu hỏi \| Phương án \| Đáp án đúng |
| **Tự luận** | Câu hỏi \| Câu trả lời / Đáp án mẫu |

Mẫu có sẵn trong `data/` (Quân sự, Chính trị, Hậu cần, Kỹ thuật). Admin → **Tải mẫu Excel**.

---

## Schema dữ liệu

### Câu hỏi (`questions.json`)

```json
{
  "title": "Hệ thống ôn tập trắc nghiệm",
  "topics": [
    {
      "title": "Quân sự",
      "questions": [
        {
          "id": 1,
          "contentHtml": "<p>Nội dung câu hỏi</p>",
          "type": "multiplechoice",
          "noShuffle": false,
          "answers": [
            { "letter": "A", "html": "<p>Đáp án A</p>", "isCorrect": false },
            { "letter": "B", "html": "<p>Đáp án B</p>", "isCorrect": true }
          ]
        }
      ]
    }
  ]
}
```

### User (`users.json`)

```json
{
  "militaryId": "12345678",
  "fullName": "Nguyễn Văn A",
  "password": "plain-text",
  "role": "user",
  "status": "pending | approved | rejected",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

## Công nghệ

- HTML / CSS / JavaScript thuần (ES6+)
- [SheetJS](https://sheetjs.com/) — import/export Excel (CDN trên admin)
- [MathJax 3](https://www.mathjax.org/) — công thức toán (CDN trên index)
- [serve](https://www.npmjs.com/package/serve) — HTTP server dev (`npm start`)

---

## Lưu ý triển khai

- **Demo / nội bộ:** LocalStorage + plain password phù hợp cho môi trường offline, một máy.
- **Production thật:** cần backend, hash mật khẩu, API lưu DB — kiến trúc hiện tại chưa hỗ trợ đồng bộ nhiều máy.
- Dữ liệu admin chỉnh trên máy A **không tự sang** máy B — cần export Excel hoặc copy LocalStorage.
- Lần đầu chưa có câu hỏi: đăng nhập Admin → Import Excel hoặc thêm thủ công.

---

## Phát triển

```cmd
npm install          # tùy chọn — chỉ cần nếu chạy script Node với xlsx
npm start            # http://localhost:8080
```

Sửa code JS/CSS/HTML → refresh trình duyệt (không build).
