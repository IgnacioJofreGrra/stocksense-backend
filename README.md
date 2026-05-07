# StockSense — Backend

Sistema de gestión de inventario para comercios de barrio. Backend en NestJS con PostgreSQL, MongoDB para analítica, GraphQL, y predicciones con Groq.

El frontend (React + Vite + PWA) está en [stocksense-frontend](https://github.com/IgnacioJofreGrra/stocksense-frontend).

## Stack

- NestJS 11 + TypeScript strict
- PostgreSQL 16 + TypeORM (datos transaccionales)
- MongoDB 7 + Mongoose (eventos de analítica, fire-and-forget)
- GraphQL (Apollo, code-first) y REST con Swagger
- JWT con refresh rotativo + bcrypt
- Groq (LLaMA 3.3 70B) para predicciones de reposición
- Docker Compose para dev y prod

## Quick start

```bash
git clone https://github.com/IgnacioJofreGrra/stocksense-backend.git
cd stocksense-backend

cp .env.example .env.local
# editar .env.local — al menos DB_PASSWORD, JWT_SECRET, GROQ_API_KEY

npm install
npm run docker:up      # postgres + mongo + pgadmin + mongo-express
npm run start:dev
```

App en `http://localhost:3000`. Swagger en `/api/docs`, GraphQL playground en `/graphql`.

## Scripts útiles

| Script | Qué hace |
|---|---|
| `npm run start:dev` | NestJS con hot-reload |
| `npm run build` | Compila a `dist/` |
| `npm test` | Tests unitarios |
| `npm run lint` | ESLint con autofix |
| `npm run docker:up` / `:down` / `:logs` | Atajos de Docker Compose |
| `npm run migration:generate` / `:run` / `:revert` | TypeORM migrations |
| `npm run job:nightly` | Job nocturno local (ts-node) |

## API

REST documentado con Swagger en `/api/docs`. Grupos: auth, products, inventory, analytics, ai.

GraphQL en `/graphql`. Subscriptions via WebSocket en `ws://localhost:3000/graphql` — la suscripción `alertaStockBajo` empuja avisos cuando un producto cae bajo su mínimo.

## Estructura

```
src/
├── auth/         JWT + register/login/refresh + perfil
├── users/        Entidad y queries de usuario
├── products/     CRUD + validador EAN-13
├── inventory/    Movimientos de stock (entrada/salida/ajuste/alertas)
├── analytics/    Eventos en MongoDB + agregaciones
├── graphql/      Resolvers, inputs, subscriptions
├── ai/           Cliente Groq + cache + rate limiter
├── notifications/  Envío de emails (SES)
├── jobs/         Job nocturno (cron / Lambda)
├── migrations/
├── common/       Validadores compartidos
└── config/       Factories de configuración
```

## Deploy

- Backend en AWS — ver `docs/DEPLOY-AWS.md` (EC2 + Docker + Nginx + Certbot, opcionalmente RDS y Atlas).
- Frontend en Vercel — ver el repo [stocksense-frontend](https://github.com/IgnacioJofreGrra/stocksense-frontend).

## Convenciones

- Código en español para dominio (`stockMinimo`, `precioVenta`), inglés para lo técnico (`controller`, `service`).
- Comentarios explican por qué, no qué.
