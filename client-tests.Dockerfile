FROM mcr.microsoft.com/playwright:v1.40.1

WORKDIR /app

# Copy application files (see .dockerignore for what's excluded)
COPY . .

# Install dependencies
RUN npm ci

# Set the entry point for the container
CMD DOCKER_TEST_RUN=true npx playwright test
