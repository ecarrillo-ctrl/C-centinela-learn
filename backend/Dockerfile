FROM node:24-alpine

RUN apk add --no-cache dumb-init libaio

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/

EXPOSE 3005

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
