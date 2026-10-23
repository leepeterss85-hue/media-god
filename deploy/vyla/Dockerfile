# Experimental noncommercial pilot. Vyla's upstream licence is Attribution-NonCommercial 4.0.
# Uses a pinned upstream commit; no Media God website or APK is built here.
FROM node:22-bookworm-slim
# node-tls-client bundles a glibc-linked native helper (libresolv.so.2).
# Alpine uses musl and crashes when Vyla's stream workers start.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/vyla
ARG VYLA_UPSTREAM_COMMIT=5b7b085c024592293b3d8f62f3df34b9ac4e18e2
RUN git clone --quiet https://gitlab.com/vyla-entertainment/stream-api.git . \
    && git checkout --quiet --detach "$VYLA_UPSTREAM_COMMIT" \
    && npm install --omit=dev --no-audit --no-fund \
    && chown -R node:node /opt/vyla
ENV NODE_ENV=production \
    ENABLE_DEBUG_ROUTE=false \
    WORKER_COUNT=1
USER node
EXPOSE 7860
CMD ["node", "server.js"]
