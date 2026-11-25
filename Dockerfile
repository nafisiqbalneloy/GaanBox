FROM node:22-alpine

WORKDIR /app
COPY . .

ENV PORT=3000 \
    DATA_FILE=/data/gaanbox.db
VOLUME /data
EXPOSE 3000

USER node
CMD ["node", "server/index.js"]
