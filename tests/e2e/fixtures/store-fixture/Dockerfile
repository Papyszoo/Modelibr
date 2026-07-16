# E2E stand-in for the companion Asset Store (see server.mjs).
# Build context = tests/e2e so the shared test assets can be copied in.
FROM node:20-alpine

WORKDIR /app
COPY fixtures/store-fixture/server.mjs ./
COPY assets/test-cube.glb assets/blue_color.png ./assets/

EXPOSE 9280
CMD ["node", "server.mjs"]
