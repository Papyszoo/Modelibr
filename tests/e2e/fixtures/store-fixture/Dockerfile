# E2E stand-in for the companion Asset Store (see server.mjs).
# Build context = tests/e2e so the shared test assets can be copied in.
FROM node:20-alpine

WORKDIR /app
COPY fixtures/store-fixture/server.mjs ./
COPY assets/test-cube.glb assets/blue_color.png ./assets/
COPY assets/store-texture-brick_albedo.ktx2 assets/store-texture-brick_normal.webp assets/store-texture-brick_roughness.png ./assets/

# The frontend talks to the store's real https origin, so the browser path needs
# the fixture served over TLS. A throwaway self-signed cert for the store host;
# the Playwright context ignores certificate errors.
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
        -keyout server.key -out server.crt \
        -subj "/CN=store.modelibr.com" \
        -addext "subjectAltName=DNS:store.modelibr.com"

# 9280 = plain http (the backend importer's test override), 9443 = https (the browser).
EXPOSE 9280 9443
CMD ["node", "server.mjs"]
