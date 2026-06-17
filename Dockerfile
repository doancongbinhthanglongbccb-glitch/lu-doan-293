# CBQuiz production image — backend serves frontend + API (monorepo)
FROM node:22-alpine

WORKDIR /app

COPY shared ./shared
COPY frontend ./frontend
COPY backend ./backend

WORKDIR /app/backend
RUN npm ci --omit=dev

ENV NODE_ENV=production

# migrate is idempotent; PORT is injected by Sevalla at runtime
CMD ["sh", "-c", "node database/migrate.js && node src/index.js"]
