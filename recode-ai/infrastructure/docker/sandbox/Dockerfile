# Image used for sandboxed builds of generated projects (react-vite).
# No secrets, no tools beyond node/npm, runs as the unprivileged `node` user.
FROM node:22-alpine
RUN mkdir -p /app /src && chown node:node /app
USER node
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
