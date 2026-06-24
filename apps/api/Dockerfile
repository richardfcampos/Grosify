# API Grosify — imagem de produção (monorepo pnpm).
# Build a partir da raiz do repo: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# Instala dependências do workspace (cacheável)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod=false

# Código
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
# Railway/Render injetam PORT; o servidor lê de process.env.PORT (default 3000).
# Migrações rodam automáticas no pre-deploy (ver railway.json → deploy.preDeployCommand),
# antes de o tráfego ir pro código novo. drizzle-kit está na imagem (--prod=false acima).
CMD ["pnpm", "--filter", "@grosify/api", "start"]
