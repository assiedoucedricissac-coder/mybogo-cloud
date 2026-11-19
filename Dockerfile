# Étape 1 : builder le frontend React
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Étape 2 : image de production
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
CMD ["node", "backend/server.js"]
