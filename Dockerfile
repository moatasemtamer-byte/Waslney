FROM node:18-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install and build frontend
RUN cd frontend && npm install && npm run build

# Install backend dependencies
RUN cd backend && npm install

# Start the server
CMD ["node", "backend/server.js"]
