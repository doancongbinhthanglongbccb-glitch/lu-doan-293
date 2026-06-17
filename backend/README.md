# CBQuiz Backend

Express REST API + SQLite. Serve `frontend/` và `shared/` cùng origin.

## Cấu trúc

```
backend/
├── src/
│   ├── index.js          # Entry point
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── utils/
├── database/
│   ├── schema.sql
│   ├── migrate.js
│   ├── connection.js
│   └── cbquiz.db         # gitignore
├── package.json
└── .env.example
```

## Chạy

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

API: `http://localhost:3000/api`  
App: `http://localhost:3000/login`

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | nodemon |
| `npm start` | migrate + production server |
| `npm run migrate` | schema + seed |

## API

Xem [../docs/API.md](../docs/API.md).

## Deploy

Xem [../docs/DEPLOY.md](../docs/DEPLOY.md).
