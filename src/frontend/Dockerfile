# Dockerfile for containerizing the React frontend application
#
# PREREQUISITES: Due to npm registry issues in Docker, node_modules should be
# pre-installed locally for faster and more reliable builds:
#   cd src/frontend && npm install

# Build stage - produces dist/
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Copy package files and pre-installed node_modules
COPY package*.json ./
COPY node_modules/ ./node_modules/

COPY . .
# Adjust if your build script name differs
RUN npm run build

# Production stage - serve built assets
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Development stage (unchanged)
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]