FROM node:18

WORKDIR /app

# Copy backend files
COPY backend/package*.json backend/package-lock.json ./
RUN npm install

COPY backend/ ./

EXPOSE 8080

CMD ["node", "server.js"]