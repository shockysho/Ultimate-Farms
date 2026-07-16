FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production=false

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Set data directory for SQLite databases
ENV DB_PATH=/app/data

EXPOSE 3000 3001

# Start both API and Dashboard servers
CMD ["node", "dist/cli.js", "serve"]
