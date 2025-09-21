# Dockerfile for containerizing the React frontend application

# Build stage - Pre-built version (build locally and copy)
FROM nginx:alpine AS production
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Development stage with Node
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
# Skip npm install in Docker for now due to certificate issues
# RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]