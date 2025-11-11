FROM python:3.12-slim

# Install Node.js and build essentials in one layer
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only dependency files first for better caching
COPY ingest/requirements.txt /app/ingest/requirements.txt
COPY backend/package*.json /app/backend/
COPY frontend/package*.json /app/frontend/

# Install Python dependencies (Railway compatible - no build cache mount needed)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r ingest/requirements.txt

# Copy the rest of the application
COPY . .

# Install Node dependencies (use ci for faster, deterministic installs)
WORKDIR /app/backend
RUN npm ci --only=production || npm install --only=production

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm ci --only=production || npm install --only=production

# Set working directory to root for startup
WORKDIR /app

# Expose ports
EXPOSE 5000 3000 8080

# Start backend server (which includes scheduler)
CMD ["node", "backend/src/server.js"]
