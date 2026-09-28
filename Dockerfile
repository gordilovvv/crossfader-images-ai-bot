FROM node:24-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
RUN pnpm exec playwright install --with-deps chromium
COPY . .
ENV NODE_ENV=production

USER node

CMD ["node", "src/main.ts"]
