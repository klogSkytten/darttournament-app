FROM node:24-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
COPY database/migrations/ /app/database/migrations/
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "run", "start"]
