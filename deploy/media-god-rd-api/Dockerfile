FROM node:22-alpine
WORKDIR /srv
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node server.mjs realDebrid.mjs realDebridAuth.mjs findRdLibrary.mjs regressionHelpers.js verifiedUserClient.mjs guestDebrid.mjs ./
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","server.mjs"]
