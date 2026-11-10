FROM node:22-alpine
WORKDIR /srv
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node server.mjs realDebrid.mjs realDebridAuth.mjs findRdLibrary.mjs multiDebrid.mjs fetchAddonStreams.mjs regressionHelpers.js verifiedUserClient.mjs guestDebrid.mjs deviceClient.mjs ./
ENV NODE_ENV=production
RUN mkdir -p /data/guest-rd && chown -R node:node /data
RUN apk add --no-cache su-exec
EXPOSE 3000
CMD ["sh", "-c", "chown node:node /data && exec su-exec node node server.mjs"]
