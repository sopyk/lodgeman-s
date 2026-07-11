FROM nginx:alpine

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data

VOLUME ["/app/config", "/app/data"]

EXPOSE 4082
CMD ["node", "src/server.js"]
