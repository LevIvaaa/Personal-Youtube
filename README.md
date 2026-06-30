# Personal YouTube 🎬

Личный **локальный** видеохостинг — YouTube в твоей обёртке, с персональными рекомендациями.
Интерфейс повторяет YouTube, видео играются встроенным плеером YouTube, а лента строится
собственным движком на основе твоей истории, лайков, интересов и подписок.

## Стек

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **PostgreSQL** + **Prisma** (ORM и миграции)
- **Tailwind CSS** (+ собственные стили под YouTube)
- **YouTube Data API v3** — источник видео

## Возможности

- ♾️ Бесконечная персональная лента (движок рекомендаций под тебя)
- 🧠 Тонкая персонализация: подписки, аффинити каналов/категорий, интересы, свежесть, анти-кликбейт
- ⚡ Реальное время: просмотр → сразу в истории, лайк → в понравившихся
- 📥 Перенос подписок и всей истории с YouTube (Google Takeout)
- 🔎 Поиск, 🔥 тренды, ▶️ просмотр + похожие
- 📜 История с вкладками **Все / Видео / Shorts**
- ⚙️ Меню аккаунта: настройка рекомендаций, смена аватарки, светлая/тёмная тема

## Запуск

```bash
npm install
cp .env.example .env       # впиши YOUTUBE_API_KEY

npm run db:start           # поднимает локальный PostgreSQL (порт 5433, без sudo/Docker)
npm run db:push            # создаёт таблицы (Prisma schema -> БД)

# (необязательно) перенести старые данные из data/profile.json:
npm run import:profile

npm run dev                # http://localhost:3000
```

Остановить БД: `npm run db:stop`.

### База данных

`npm run db:start` поднимает **настоящий PostgreSQL** в user-space (свой `initdb`-кластер в
`~/.personal-youtube/pgdata`, порт 5433) — без `sudo` и Docker. Можно указать любой другой
сервер в `DATABASE_URL` (`.env`). Схема — в [`prisma/schema.prisma`](prisma/schema.prisma),
посмотреть данные: `npm run db:studio`.

### Где взять YOUTUBE_API_KEY (бесплатно)

1. <https://console.cloud.google.com/> → создай проект
2. **APIs & Services → Library** → включи **YouTube Data API v3**
3. **Credentials → Create credentials → API key** → впиши в `.env`

## Структура

```
prisma/schema.prisma   — модели БД (Prisma)
src/lib/db.ts          — Prisma-клиент
src/lib/youtube.ts     — клиент YouTube Data API + кэш (экономия квоты)
src/lib/profile.ts     — профиль рекомендаций поверх PostgreSQL
src/lib/recommender.ts — движок бесконечной ленты + скоринг
src/app/api/*          — route-хендлеры (feed, search, video, subscriptions, history, event, img …)
src/app/*              — страницы (главная, watch, history, subscriptions, liked, trending, search)
src/components/*       — AppShell, Feed, VideoCard …
scripts/db-start.sh    — локальный PostgreSQL
```

## Приватность

`.env`, токен GitHub, Takeout-экспорт и данные БД — **не коммитятся** (см. `.gitignore`).
Видео отдаёт сам YouTube (iframe), мы их не храним.
