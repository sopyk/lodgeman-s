FROM alpine:3.21

RUN apk add --no-cache nodejs npm tzdata \
    && rm -rf /var/cache/apk/* /tmp/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY assets/ ./assets/
COPY scripts/ ./scripts/
COPY package.json ./

RUN mkdir -p /app/data

VOLUME ["/app/config", "/app/data"]

EXPOSE 4082
CMD ["node", "src/server.js"]
