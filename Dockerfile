FROM node:18-alpine

WORKDIR /app

COPY . .

# Fix corrupted frontend package.json
RUN echo '{"name":"shuttle-frontend","version":"1.0.0","scripts":{"dev":"vite","build":"vite build","preview":"vite preview"},"dependencies":{"leaflet":"^1.9.4","react":"^18.3.1","react-dom":"^18.3.1","react-leaflet":"^4.2.1","socket.io-client":"^4.7.5"},"devDependencies":{"@vitejs/plugin-react":"^4.2.1","vite":"^5.2.0"}}' > frontend/package.json

# Build frontend
RUN cd frontend && npm install && npm run build

# Install backend
RUN cd backend && npm install

CMD ["node", "backend/server.js"]
