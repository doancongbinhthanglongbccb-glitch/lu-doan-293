# Deploy

Production deploy trên **[Sevalla](https://app.sevalla.com/)** — Node.js Application (không phải Static Site).

Backend serve `frontend/` + `/api` cùng origin — **không** cần deploy frontend riêng.

---

## Checklist trước deploy

- [ ] Code đã push lên Git (GitHub / GitLab / Bitbucket)
- [ ] Tài khoản Sevalla + payment method (nếu dùng private Git < 30 ngày)
- [ ] Biến môi trường đã chuẩn bị (xem bảng bên dưới)
- [ ] **Persistent disk** đã tạo (SQLite cần volume, không dùng ephemeral storage)

---

## Tạo Application trên Sevalla

1. Đăng nhập [app.sevalla.com](https://app.sevalla.com/)
2. **Applications** → **Create** → **Application**
3. Kết nối Git repo `TSQCB`, branch `main`, bật **Auto-deploy**
4. **Root directory**: để trống (repo gốc — cần `frontend/` cho migrate seed)
5. **Build strategy**: **Dockerfile** (khuyến nghị — tránh lỗi thiếu `express` với Nixpacks monorepo)  
   **Settings** → **Build strategy** → **Update build strategy** → **Dockerfile**
6. Push code có `Dockerfile` ở root → **Deploy now**

### Nixpacks (dự phòng)

Nếu dùng Nixpacks thay Dockerfile, repo có `nixpacks.toml` — **phải** `cd backend && npm ci`, không dùng `npm install` ở root.

| Trường | Giá trị |
|--------|---------|
| Build command | `cd backend && npm ci --omit=dev && node database/migrate.js` |
| Start command | `cd backend && npm start` |

---

## Persistent storage (bắt buộc)

SQLite **phải** nằm trên persistent disk — ephemeral storage mất dữ liệu mỗi lần redeploy.

1. **Applications** → app → **Disks** → **Create disk**
2. **Process**: web
3. **Path**: `/app/data` — **chỉ thư mục**, không ghi `/app/data/cbquiz.db`  
   (file DB do app tạo qua env `DB_PATH`)
4. **Size**: 10 GB (đủ cho quiz + users)

Sau đó set env:

```
DB_PATH=/app/data/cbquiz.db
```

> Sevalla: process có persistent storage **chỉ 1 instance** (không horizontal scale). Phù hợp CBQuiz.

Chi tiết: [Sevalla — Persistent storage](https://docs.sevalla.com/applications/storage)

---

## Biến môi trường

Thêm tại **Applications** → app → **Environment variables**.  
Bật **Build** + **Runtime** cho các biến cần lúc migrate và khi chạy app.

| Biến | Build | Runtime | Giá trị / ghi chú |
|------|:-----:|:-------:|-------------------|
| `NODE_ENV` | ✓ | ✓ | `production` (Sevalla **không** tự set) |
| `JWT_SECRET` | | ✓ | Chuỗi ngẫu nhiên ≥ 32 ký tự |
| `ADMIN_PASSWORD` | ✓ | ✓ | Mật khẩu mạnh ≥ 6 ký tự — seed admin `00000001` lần đầu (Dockerfile: migrate chạy lúc start) |
| `DB_PATH` | ✓ | ✓ | `/app/data/cbquiz.db` |
| `PORT` | | | Sevalla **tự inject** — không cần set |

Tùy chọn:

| Biến | Mặc định |
|------|----------|
| `JWT_ACCESS_EXPIRES` | `1h` |
| `JWT_REFRESH_EXPIRES` | `7d` |
| `BCRYPT_ROUNDS` | `10` |

Import nhanh: copy nội dung `backend/.env.example`, sửa giá trị, **Import .env** trên Sevalla.

> `ADMIN_PASSWORD` chỉ dùng khi DB trống (migrate seed admin `00000001`). Redeploy sau không cần đổi trừ khi xóa disk.

---

## Deploy & kiểm tra

1. **Deployments** → **Deploy now** (hoặc push lên branch auto-deploy)
2. Health: `https://<tên-app>.sevalla.app/api/health`
3. App: `https://<tên-app>.sevalla.app/login`
4. Admin: `https://<tên-app>.sevalla.app/admin`
5. Login admin: số QN `00000001`, mật khẩu = `ADMIN_PASSWORD` đã set trước migrate đầu

### Custom domain

**Applications** → app → **Domains** → thêm domain của đơn vị (cần pod > Hobby nếu dùng custom domain).

---

## Backup

- Sevalla backup persistent disk **hàng ngày**, giữ 7 ngày — restore qua Support
- Nên export quiz định kỳ qua Admin → Export Excel

---

## Local production

```bash
cd backend
cp .env.example .env
# Sửa ADMIN_PASSWORD, JWT_SECRET trong .env
npm install
npm run migrate
npm start
```

Mở `http://localhost:3000/login`

---

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

> Dev fullstack: port **3000**. Port 8080 chỉ debug UI tĩnh — không gọi API được.

---

## Bảo mật

- HTML câu hỏi sanitize khi lưu (BE) và hiển thị (FE)
- Helmet CSP: MathJax, Google Fonts, SheetJS từ CDN
- Rate limit login/register: **5 lần thất bại / 15 phút / mã quân nhân** (production)
- JWT trong localStorage — đủ cho nội bộ; nâng cao hơn → httpOnly cookie sau

## Tài liệu Sevalla

- [Add an application](https://docs.sevalla.com/applications/get-started/add-an-application)
- [Environment variables](https://docs.sevalla.com/applications/environment-variables)
- [Persistent storage](https://docs.sevalla.com/applications/storage)
- [Nixpacks](https://docs.sevalla.com/applications/build-options/nixpacks)
