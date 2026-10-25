FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.5.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN pnpm build
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["node", "dist/server.js"]
