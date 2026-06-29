# Локальный запуск Personal YouTube в контейнере.
# Сборка:  docker build -t personal-youtube .
# Запуск:  docker run -p 3000:3000 -e YOUTUBE_API_KEY=... -v $(pwd)/data:/app/data personal-youtube
FROM node:20-alpine

WORKDIR /app

# Сначала зависимости — для кэша слоёв
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Затем код
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY data/profile.seed.json ./data/profile.seed.json

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Простой healthcheck по /api/status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
