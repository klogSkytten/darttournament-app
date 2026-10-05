FROM node:24-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd ./backend && npm install

COPY backend ./backend
COPY database/migrations/schema/ /app/database/migrations/schema/

WORKDIR /app/backend
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "run", "start"]
