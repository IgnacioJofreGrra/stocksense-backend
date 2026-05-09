#!/bin/bash
# Deploy en EC2 — pull + rebuild + restart.
#
# Uso (desde la maquina del operador):
#   ssh ec2-user@<IP> 'bash -s' < scripts/deploy.sh
#
# Pre-requisitos en la EC2:
#   - Repo clonado en /home/ec2-user/stocksense-backend
#   - .env.production con valores reales en la raiz del repo
#   - Docker + docker compose v2 instalados
#   - El usuario ec2-user en el grupo docker (sin sudo)
#
# set -e: corta a la primera falla. set -u: error si referenciamos var no
# definida. set -o pipefail: el exit del pipe es el del primer comando que falle.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ec2-user/stocksense-backend}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

echo "=== StockSense Deploy ==="
echo "[1/5] cd $REPO_DIR"
cd "$REPO_DIR"

echo "[2/5] git pull origin main"
git pull --ff-only origin main

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: falta $ENV_FILE en $REPO_DIR"
  echo "Copiar .env.production.example a $ENV_FILE y completar valores."
  exit 1
fi

echo "[3/5] docker compose build"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache app

echo "[4/5] docker compose up -d"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "[5/5] esperando que la app responda..."
# 30 intentos x 2s = max 60s. Si no respondio, mostramos logs y salimos con error.
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/docs > /dev/null; then
    echo "OK app respondiendo en http://localhost:3000/api/docs"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=20 app
    exit 0
  fi
  sleep 2
done

echo "ERROR la app no respondio en 60s; ultimos logs:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=50 app
exit 1
