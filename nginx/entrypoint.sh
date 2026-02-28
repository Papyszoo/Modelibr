#!/bin/sh
set -e

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/selfsigned.crt"
KEY_FILE="$CERT_DIR/selfsigned.key"

# Generate self-signed certificate if it doesn't already exist
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "Generating self-signed SSL certificate..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=XX/ST=Local/L=Local/O=Modelibr/OU=Dev/CN=modelibr.local" \
        -addext "subjectAltName=DNS:localhost,DNS:modelibr.local,IP:127.0.0.1"
    echo "SSL certificate generated."
else
    echo "SSL certificate already exists, skipping generation."
fi

exec "$@"
