# Onboarding bot (iMessage via Photon + local HTTP channel for the ASI:One relay).
FROM node:22-slim
WORKDIR /app
COPY onboarding/package.json onboarding/package-lock.json ./
RUN npm ci
COPY onboarding/tsconfig.json ./
COPY onboarding/src src
COPY onboarding/scripts scripts
ENV BOT_HTTP_HOST=0.0.0.0
CMD ["npx", "tsx", "src/index.ts"]
