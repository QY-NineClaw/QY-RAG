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

COPY patches/ /tmp/patches/
RUN cp /tmp/patches/picture.py /ragflow/rag/app/picture.py && \
    cp /tmp/patches/sequence2txt_model.py /ragflow/rag/llm/sequence2txt_model.py && \
    cp /tmp/patches/provider_api_service.py /ragflow/api/apps/services/provider_api_service.py && \
    cp /tmp/patches/cv_model_patched.py /ragflow/rag/llm/cv_model.py && \
    rm -rf /tmp/patches
