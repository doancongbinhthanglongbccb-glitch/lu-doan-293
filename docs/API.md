# API Reference

Base URL: `/api`

Chi tiết đầy đủ: [backend/README.md](../backend/README.md)

## Auth — `/api/auth`

| Method | Path | Auth |
|--------|------|------|
| POST | `/login` | — |
| POST | `/register` | — |
| POST | `/logout` | Bearer |
| GET | `/me` | Bearer |
| POST | `/refresh` | — |
| GET | `/battalions` | — (tiểu đoàn active cho form đăng ký) |

## Quiz — `/api/quiz`

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | User — payload có `version` (optimistic lock) |
| PUT | `/` | Admin — gửi kèm `version`; lệch → `409` |
| PATCH | `/settings` | Admin — cài đặt ôn tập + buffer Kiểm tra |
| GET | `/wrong-history` | User |
| POST | `/wrong-history` | User |
| GET | `/practice-mixed/sets` | User — danh sách bộ + tiến độ |
| GET | `/practice-mixed/sets/:id` | User — nội dung bộ |
| POST | `/practice-mixed/sets/:id/progress` | User — ghi tiến độ |
| POST | `/practice-mixed/regenerate` | Admin — tái tạo N bộ |
| GET | `/history` | User — lịch sử thi thử cũ (API giữ, UI không dùng) |
| POST | `/history` | User — lưu thi thử cũ (API giữ, UI không dùng) |
| GET | `/history/all` | Admin — lịch sử thi thử cũ (`?search=&battalionId=&limit=`) |

## Exam (Kiểm tra) — `/api/exam`

Tất cả route yêu cầu Bearer token (`requireAuth`).

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| GET | `/sessions/open` | User | Đợt đang mở cho tiểu đoàn của user |
| GET | `/history` | User | Lịch sử Kiểm tra của chính mình (`?branch=topic\|mixed&limit=`) |
| GET | `/sessions/:id/topics` | User | Lĩnh vực có bộ trong đợt |
| GET | `/sessions/:id/branches` | User | Nhánh khả dụng (lĩnh vực / trộn) |
| GET | `/sessions/:id/sets` | User | Danh sách bộ (`?topicId=` nếu theo lĩnh vực) |
| GET | `/sessions/:id/readiness` | User | Có thể bắt đầu không (`?topicId=`) |
| POST | `/sessions/:id/start` | User | Bắt đầu bộ đã chọn (`sessionSetId`, `topicId?`) |
| POST | `/sessions/:id/submit` | User | Nộp bài Kiểm tra |
| GET | `/sessions` | Admin | Danh sách đợt |
| POST | `/sessions` | Admin | Tạo đợt |
| PATCH | `/sessions/:id` | Admin | Sửa đợt (draft) |
| POST | `/sessions/:id/open` | Admin | Mở đợt (+ sinh bộ đề) |
| POST | `/sessions/:id/close` | Admin | Đóng đợt |
| POST | `/sessions/:id/regenerate` | Admin | Tái tạo bộ đề |
| GET | `/history/all` | Admin | Lịch sử Kiểm tra (`?battalionId=&branch=&search=&limit=`) |
| GET | `/sessions/:id/progress-matrix` | Admin | Ma trận tiến độ đợt |

## Battalions — `/api/battalions`

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | Admin |
| GET | `/dashboard/registration` | Admin — đăng ký + thống kê Kiểm tra |
| POST | `/` | Admin |
| PATCH | `/:id` | Admin |
| DELETE | `/:id` | Admin (chỉ khi 0 user) |

## Users — `/api/users` (admin)

| Method | Path |
|--------|------|
| GET | `/` |
| PATCH | `/:militaryId` |
| PATCH | `/:militaryId/approve` |
| PATCH | `/:militaryId/reject` |
| POST | `/:militaryId/reset-password` |
| DELETE | `/:militaryId` |

## Health

`GET /api/health`

## App pages (không qua `/api`)

| Path | Mô tả |
|------|--------|
| `/login` | Đăng nhập |
| `/register` | Đăng ký |
| `/quiz` | Ôn tập / Kiểm tra |
| `/admin` | Quản trị |
