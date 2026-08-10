FROM node:20-bookworm-slim AS web-builder

WORKDIR /build/web

COPY web/package.json web/package-lock.json web/.npmrc ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

COPY web ./
COPY docs /build/docs
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    NODE_OPTIONS="--max-old-space-size=8192" \
    VITE_BUILD_SOURCEMAP=false \
    VITE_MINIFY=esbuild \
    npm run build

FROM infiniflow/ragflow:v0.26.1

COPY --from=web-builder /build/web/dist /ragflow/web/dist
