FROM node:23-slim

WORKDIR /app

# Install git
RUN apt-get update && apt-get install -y git

# Copy package files first (for better Docker layer caching)
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (without building yet)
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose port
EXPOSE 3006

# Start the application
CMD ["npm", "start"] 