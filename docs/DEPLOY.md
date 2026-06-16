# Deploy

## Render (khuyến nghị)

### Checklist trước deploy

- [ ] Code đã push lên GitHub (`git push origin main`)
- [ ] Render Dashboard → **Environment** → đặt `ADMIN_PASSWORD` (mật khẩu mạnh, ≥ 6 ký tự)
- [ ] `JWT_SECRET` — Render tự generate qua Blueprint (không cần nhập tay)
- [ ] Disk `/var/data` đã bật (trong `render.yaml`)

### Các bước

1. Push repo lên GitHub
2. Render → **New Blueprint** → chọn repo `TSQCB`
3. `render.yaml` tự cấu hình `rootDir: backend`, `buildCommand: npm install && npm run migrate`
4. **Trước khi deploy lần đầu:** vào service → **Environment** → thêm `ADMIN_PASSWORD`
5. Deploy xong → kiểm tra `https://<tên-app>.onrender.com/api/health`
6. Login admin: số QN `00000001`, mật khẩu = `ADMIN_PASSWORD` đã đặt

> **Lưu ý:** `ADMIN_PASSWORD` chỉ dùng khi **seed admin lần đầu** (DB trống). Deploy sau không cần đổi trừ khi reset disk.

### Sau deploy

| Kiểm tra | URL |
|----------|-----|
| Health | `/api/health` |
| App | `/login.html` |
| Admin | `/admin.html` |

Backup định kỳ file SQLite tại `/var/data/cbquiz.db` (Render Shell hoặc snapshot disk).

Backend serve `frontend/` + `/api` cùng origin — không cần deploy frontend riêng.

**Bảo mật:** HTML câu hỏi được sanitize khi lưu (BE) và khi hiển thị (FE). Helmet CSP bật mặc định (MathJax + Google Fonts từ CDN).

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
| `ADMIN_PASSWORD` | Mật khẩu admin ban đầu (`00000001`) — **bắt buộc** khi chạy migrate lần đầu |
| `DB_PATH` | Đường dẫn SQLite |
| `NODE_ENV` | `production` / `development` |
