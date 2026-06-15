# Deploy

## Render (khuyến nghị)

1. Push repo lên GitHub
2. Render → **New Blueprint** → chọn repo
3. `render.yaml` tự cấu hình `rootDir: backend`
4. `JWT_SECRET` được generate
5. **Disk** `/var/data` — giữ SQLite (có phí disk nhỏ)

Backend serve `frontend/` + `/api` cùng origin — không cần deploy frontend riêng.

## Local production

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm start
```

Mở `http://localhost:3000/login.html`

## Development

```bash
npm install
cd backend && npm install && cd ..
npm run dev
```

| Service | URL |
|---------|-----|
| Backend + API | http://localhost:3000 |
| Frontend only (debug) | http://localhost:8080 |

> Dev fullstack: dùng port **3000** (backend serve frontend). Port 8080 chỉ khi debug UI tĩnh — cần proxy API hoặc CORS.

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `PORT` | HTTP port (Render set tự động) |
| `JWT_SECRET` | Secret ký JWT |
| `DB_PATH` | Đường dẫn SQLite |
| `NODE_ENV` | `production` / `development` |
