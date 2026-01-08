FROM oven/bun:latest AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
RUN bun build ./src/index.ts --outdir ./dist --minify --target bun --sourcemap=inline

FROM oven/bun:latest AS runtime

WORKDIR /app

COPY --from=build /app/dist ./dist
CMD ["bun", "dist/index.js"]
