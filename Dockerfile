FROM node:lts

RUN mkdir -p /app
COPY ./server.mjs /app/
COPY ./package.json /app/
COPY ./package-lock.json /app/
COPY ./public/ /app/public/

WORKDIR /app
RUN npm ci --include=prod

CMD ["npm",  "run", "start"]