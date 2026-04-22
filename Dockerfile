FROM node:20

# Install Python and System Dependencies for Playwright
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install -g pm2
RUN npm ci --only=production

# Copy source code (assuming backend is build context)
COPY . .

# Install Python dependencies and Playwright browsers
RUN if [ -d "./mba_scraper" ]; then \
        pip3 install -r ./mba_scraper/requirements.txt; \
        python3 -m playwright install chromium; \
    fi

EXPOSE 3000

# Start everything with PM2
CMD ["pm2-runtime", "pm2.config.js", "--env", "production"]

