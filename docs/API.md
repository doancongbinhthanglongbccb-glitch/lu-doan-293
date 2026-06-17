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

## Quiz — `/api/quiz`

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | User |
| PUT | `/` | Admin |
| GET | `/wrong-history` | User |
| POST | `/wrong-history` | User |
| GET | `/history` | User — lịch sử thi của chính mình |
| POST | `/history` | User — lưu kết quả thi thử |
| GET | `/history/all` | Admin — lịch sử thi toàn hệ thống (`?search=&limit=`) |

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
| `/quiz` | Ôn tập / thi thử |
| `/admin` | Quản trị |
