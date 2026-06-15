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
