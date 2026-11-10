FROM node:22-alpine
WORKDIR /srv
COPY --chown=node:node server.mjs getTmdbMovies.mjs resolveImdb.mjs resolveTvImdb.mjs fetchAddonStreams.mjs getEntertainmentNews.mjs getSkipSegments.mjs getFireTvApkLink.mjs publicDiscovery.mjs package.json ./
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
