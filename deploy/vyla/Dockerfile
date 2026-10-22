# Experimental noncommercial pilot. Vyla's upstream licence is Attribution-NonCommercial 4.0.
# Uses a pinned upstream commit; no Media God website or APK is built here.
FROM node:22-alpine
RUN apk add --no-cache git ca-certificates
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
