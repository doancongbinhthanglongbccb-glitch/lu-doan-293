# Database

SQLite file: `backend/database/cbquiz.db` (gitignore)

## Bảng

| Bảng | Mô tả |
|------|--------|
| `users` | Tài khoản (military_id, bcrypt password) |
| `refresh_tokens` | JWT refresh token hashes |
| `quiz_meta` | Tiêu đề ngân hàng câu hỏi |
| `topics` | Chủ đề |
| `questions` | Câu hỏi (payload JSON) |
| `wrong_answers` | Lịch sử câu sai theo user |
| `user_quiz_history` | Lịch sử thi (dự phòng) |

Schema: [`backend/database/schema.sql`](../backend/database/schema.sql)

## Migration

```bash
npm run migrate
```

Tự động:
1. Apply schema
2. Seed admin `00000001` / `admin123`
3. Seed quiz từ `frontend/data/questions.json` (nếu DB trống)

## Render + Persistent Disk

Đặt `DB_PATH=/var/data/cbquiz.db` và mount disk tại `/var/data`.

Không có disk: mỗi deploy chạy lại migrate + seed — dữ liệu tự thêm sẽ mất.
