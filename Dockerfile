FROM oven/bun:1.1.26-slim

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Set the entry point to run the application with bun start
CMD ["bun", "start"]