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
| GET | `/outline` | User — cây chủ đề + `questionCount` + settings, **không** câu/đáp án |
| GET | `/` | Admin — payload đầy đủ, có `version` (optimistic lock) |
| PUT | `/` | Admin — gửi kèm `version`; lệch → `409` |
| PATCH | `/settings` | Admin — cài đặt ôn tập + buffer Kiểm tra |
| GET | `/wrong-history` | User |
| POST | `/wrong-history` | User |
| POST | `/wrong-review` | User — ôn câu sai của chính mình (`topicIds`, `minWrongCount`, `count`) |
| POST | `/grade-question` | User — chấm 1 câu ôn tập (`questionId`, `selected?`, `textValue?`). Trả `{ answered, correct }`; khi sai thêm `explanation` (đáp án đúng). **Không** `isCorrect`. |
| GET | `/practice-mixed/sets` | User — danh sách bộ + tiến độ |
| GET | `/practice-mixed/sets/:id` | User — nội dung bộ (**không** `isCorrect`) |
| POST | `/practice-mixed/sets/:id/progress` | User — ghi tiến độ |
| POST | `/practice-mixed/regenerate` | Admin — tái tạo N bộ |
| GET | `/topic-review/:topicId/sets` | User — danh sách bộ ôn từng phần |
| GET | `/topic-review/:topicId/sets/:setIndex` | User — nội dung bộ (**không** `isCorrect`) |
| POST | `/topic-review/:topicId/sets/:setIndex/progress` | User — ghi tiến độ |
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
| GET | `/sessions/:id/branches` | User | Nhánh khả dụng (lĩnh vực / tổng hợp) |
| GET | `/sessions/:id/sets` | User | Danh sách bộ (`?topicId=` nếu theo lĩnh vực) |
| GET | `/sessions/:id/readiness` | User | Có thể bắt đầu không (`?topicId=`) |
| POST | `/sessions/:id/start` | User | Bắt đầu bộ đã chọn (`sessionSetId`, `topicId?`). Payload câu **không** có `isCorrect`. |
| POST | `/sessions/:id/submit` | User | Nộp bài. Response có điểm server-side; `questions` (kèm đáp án) chỉ sau khi nộp. |
| GET | `/sessions` | Admin | Danh sách đợt |
| POST | `/sessions` | Admin | Tạo đợt |
| PATCH | `/sessions/:id` | Admin | Sửa đợt (draft) |
| POST | `/sessions/:id/open` | Admin | Mở đợt (+ sinh bộ đề) |
| POST | `/sessions/:id/close` | Admin | Đóng đợt |
| POST | `/sessions/:id/regenerate` | Admin | Tái tạo bộ đề |
| GET | `/history/all` | Admin | Lịch sử Kiểm tra (`?battalionId=&branch=&search=&limit=`) |
| GET | `/sessions/:id/progress-matrix` | Admin | Tiến độ đợt |

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

## Lectures — `/api/lectures`

Object storage (MinIO local / R2 production). Metadata trong SQLite. File không nằm trên disk 10GB.

Luồng upload: `POST /` tạo `status=pending` + `upload_url` (presigned PUT, Content-Type khóa cứng) → browser PUT file → `POST /:id/confirm` (`headObject` rồi mới `ready`). Lính chỉ thấy `ready`.

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | User — chỉ `ready`, theo tiểu đoàn (không gán = tất cả). Admin — mọi trạng thái, `?type=&battalion_id=&status=` |
| POST | `/` | Admin — body `{ title, description?, type: video\|document, battalion_ids?, content_type, original_name, size_bytes? }`. MIME: `video/mp4`, `video/webm`, `application/pdf` |
| POST | `/:id/confirm` | Admin (mọi admin). Chỉ khi `pending`. Thiếu object → 400, **giữ pending** |
| PUT | `/:id` | Admin — `{ title?, description?, battalion_ids? }` (không đổi file) |
| DELETE | `/:id` | Admin — xóa object storage rồi mới xóa row |
| GET | `/:id/url` | User approved. Không tồn tại / chưa `ready` → **404**. `ready` nhưng sai tiểu đoàn → **403**. Admin bỏ qua check tiểu đoàn. Presigned GET TTL 1,5 giờ |

## App pages (không qua `/api`)

| Path | Mô tả |
|------|--------|
| `/login` | Đăng nhập |
| `/register` | Đăng ký |
| `/quiz` | Ôn tập / Kiểm tra |
| `/admin` | Quản trị |
