FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs

RUN npm run build

CMD ["npm", "run", "start"]
