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
| `user_quiz_history` | Lịch sử thi thử theo user |

Schema: [`backend/database/schema.sql`](../backend/database/schema.sql)

## Migration

```bash
npm run migrate
```

Tự động:
1. Apply schema
2. Seed admin `00000001` — mật khẩu từ biến môi trường `ADMIN_PASSWORD` (bắt buộc lần seed đầu)
3. Seed quiz từ `frontend/data/questions.json` — **chỉ lần đầu cài đặt** (`quiz_meta.seed_applied = 0`). Sau khi admin đã lưu hoặc đã seed một lần, redeploy **không** nạp lại mẫu dù ngân hàng trống.

## Sevalla + Persistent storage

Mount disk tại `/app/data` (path hợp lệ với Nixpacks — xem [Sevalla storage docs](https://docs.sevalla.com/applications/storage)).

```
DB_PATH=/app/data/cbquiz.db
```

Không có persistent disk: mỗi deploy chạy lại migrate — dữ liệu tự thêm sẽ mất.
