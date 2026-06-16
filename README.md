# CBQuiz — Hệ thống ôn tập trắc nghiệm

Fullstack monorepo cho **Đoàn Công binh Thăng Long**.
**v2.1** — ES Modules + Express API + JWT + SQLite (online-only)

---

## Cấu trúc

```
cbquiz/
├── frontend/          # Giao diện (HTML, CSS, JS)
├── backend/           # API server (Express + SQLite)
│   ├── src/           # Application code
│   └── database/      # Schema, migrate, SQLite
├── shared/            # Constants dùng chung FE + BE
├── docs/              # API, Deploy, Database
├── scripts/           # Helper scripts
├── render.yaml        # Deploy Render
└── package.json       # Root scripts (dev, lint, migrate)
```

---

## Quick start

```bash
# Cài dependencies
npm install
cd backend && npm install && cd ..

# Cấu hình backend — đặt ADMIN_PASSWORD trong backend/.env trước khi migrate
cd backend && cp .env.example .env
# Sửa ADMIN_PASSWORD trong .env, rồi:
cd ..

# Migrate DB + seed admin (00000001)
npm run migrate

# Chạy fullstack (backend serve frontend + API)
npm run dev
```

| URL | Mô tả |
|-----|--------|
| http://localhost:3000 | App + API (khuyến nghị) |
| http://localhost:8080 | Chỉ static UI (debug, không gọi API) |

**Admin đầu tiên:** số quân nhân `00000001` — mật khẩu = giá trị `ADMIN_PASSWORD` bạn đặt trong `backend/.env` khi migrate (không hardcode trong code).

---

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Backend serve frontend + API (port 3000) |
| `npm run dev:backend` | Giống `dev` |
| `npm run dev:frontend` | Chỉ static (port 8080, debug UI) |
| `npm run migrate` | DB schema + seed |
| `npm run lint` | ESLint frontend + backend |
| `npm start` | Production (backend) |

---

## Deploy

Xem [docs/DEPLOY.md](docs/DEPLOY.md) — Render Blueprint với `render.yaml`.

---

## Tài liệu

- [docs/API.md](docs/API.md) — REST API
- [docs/DATABASE.md](docs/DATABASE.md) — SQLite schema
- [backend/README.md](backend/README.md) — Chi tiết backend

---

## Kiến trúc

```
Browser → Express (backend/src)
            ├── /api/*     → SQLite
            ├── /shared/*  → shared/
            └── /*         → frontend/ (static)
```

LocalStorage client: cache session, JWT, quiz. Lịch sử câu sai sync qua `/api/quiz/wrong-history`.

---

## Công nghệ

Node.js 22+ · Express · SQLite (`node:sqlite`) · JWT · bcrypt  
Vanilla JS ES Modules · ESLint · Prettier · MathJax · SheetJS
