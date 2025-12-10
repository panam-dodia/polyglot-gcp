FROM node:18

WORKDIR /app

# Copy package files
COPY backend/package*.json ./
RUN npm install

# Copy rest of backend
COPY backend/ ./

EXPOSE 8080

CMD ["node", "server.js"]