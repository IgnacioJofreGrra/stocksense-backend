# Deploy del backend de StockSense en AWS Free Tier

Esta guia describe paso a paso como llevar el backend de NestJS a una EC2 t2.micro con HTTPS detras de Nginx, usando Docker Compose. Esta pensada para que un operador que no toca codigo pueda copiar/pegar comandos.

## Indice

1. [Cuenta AWS y prerequisitos](#1-cuenta-aws-y-prerequisitos)
2. [Lanzar la EC2](#2-lanzar-la-ec2)
3. [Instalar Docker en la instancia](#3-instalar-docker-en-la-instancia)
4. [Clonar el repo y configurar variables](#4-clonar-el-repo-y-configurar-variables)
5. [Levantar el stack con Docker Compose](#5-levantar-el-stack-con-docker-compose)
6. [Nginx como reverse proxy](#6-nginx-como-reverse-proxy)
7. [HTTPS con Certbot (Let's Encrypt)](#7-https-con-certbot-lets-encrypt)
8. [Apuntar el dominio](#8-apuntar-el-dominio)
9. [Verificacion y deploy automatizado](#9-verificacion-y-deploy-automatizado)
10. [Alternativa: MongoDB Atlas](#10-alternativa-mongodb-atlas)
11. [Alternativa: PostgreSQL en RDS](#11-alternativa-postgresql-en-rds)
12. [Job nocturno: cron en EC2 vs Lambda](#12-job-nocturno-cron-en-ec2-vs-lambda)
13. [Emails de alerta con AWS SES](#13-emails-de-alerta-con-aws-ses)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Cuenta AWS y prerequisitos

- Cuenta AWS activa (o Free Tier nuevo: 12 meses gratis para servicios elegibles).
- Region: cualquiera. Sugerido: `us-east-1` (mas opciones de Free Tier) o `sa-east-1` (latencia menor desde Latinoamerica).
- Un par de claves SSH:
  - Si no tenes uno: AWS Console -> EC2 -> Network & Security -> Key Pairs -> Create. Descargar el `.pem`.
  - Permisos en el archivo: `chmod 400 stocksense-key.pem` (Linux/Mac) o equivalente en Windows.
- Un dominio (opcional pero recomendado para HTTPS). Sirve cualquiera donde puedas crear un registro A: GoDaddy, Namecheap, Cloudflare, NIC.cl, etc.

## 2. Lanzar la EC2

1. EC2 -> **Launch Instance**.
2. **Name:** `stocksense-prod`.
3. **AMI:** Amazon Linux 2023 (Free Tier eligible).
4. **Instance type:** `t2.micro` (Free Tier: 750h/mes los primeros 12 meses).
5. **Key pair:** seleccionar el creado en el paso 1.
6. **Network settings -> Edit -> Security Group:**
   - Crear nuevo: `stocksense-sg`.
   - Reglas inbound:
     - SSH (22) - Source: Mi IP (no 0.0.0.0/0, esto reduce superficie de ataque).
     - HTTP (80) - Source: 0.0.0.0/0.
     - HTTPS (443) - Source: 0.0.0.0/0.
   - **NO** abrir 3000: la app escucha solo en localhost; Nginx hace el proxy.
7. **Storage:** 30 GB gp3 (Free Tier permite hasta 30 GB).
8. **Launch instance** y esperar a que el estado sea **Running**.

Anotar la **Public IPv4 address** y, si vas a usar dominio, opcionalmente asignar una **Elastic IP** (IP fija; gratis mientras este asociada a una instancia corriendo).

## 3. Instalar Docker en la instancia

Conectar por SSH:

```bash
ssh -i stocksense-key.pem ec2-user@<IP_PUBLICA>
```

Dentro de la instancia:

```bash
# Actualizar paquetes
sudo dnf update -y

# Instalar Docker
sudo dnf install -y docker
sudo systemctl enable --now docker

# Agregar ec2-user al grupo docker (para no usar sudo cada vez)
sudo usermod -aG docker ec2-user

# Instalar docker compose v2 (plugin)
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Instalar git
sudo dnf install -y git

# Salir y volver a entrar para que el grupo docker tome efecto
exit
```

Reconectar y verificar:

```bash
ssh -i stocksense-key.pem ec2-user@<IP_PUBLICA>
docker --version
docker compose version
```

## 4. Clonar el repo y configurar variables

```bash
# En la instancia
cd /home/ec2-user
git clone <URL_DEL_REPO> stocksense-backend
cd stocksense-backend

# Crear .env.production a partir de la plantilla
cp .env.production.example .env.production

# Editar valores reales:
nano .env.production
```

Valores criticos a generar (en tu maquina, no commitearlos):

```bash
# Password Postgres
openssl rand -base64 32

# JWT secret
openssl rand -base64 64

# Password Mongo (si se usa el mongo del compose)
openssl rand -base64 32
```

Pegar los valores en `.env.production`. La **GROQ_API_KEY** se obtiene gratis en `console.groq.com/keys`.

## 5. Levantar el stack con Docker Compose

```bash
# Build y up
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Verificar contenedores
docker compose -f docker-compose.prod.yml ps
```

Deberias ver `stocksense-app`, `stocksense-postgres` y `stocksense-mongo` en estado **healthy** o **running**.

```bash
# Verificar que la app responde localmente
curl http://localhost:3000/api/docs
# (HTML de Swagger; si retorna error, ver logs)

# Logs en vivo
docker compose -f docker-compose.prod.yml logs -f app
```

Las migrations TypeORM se aplican solas al arrancar (`migrationsRun: true` en prod). En logs se ve `Init1778339235976` aplicada al primer arranque, despues queda en silencio.

## 6. Nginx como reverse proxy

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

Crear config para StockSense:

```bash
sudo nano /etc/nginx/conf.d/stocksense.conf
```

Pegar:

```nginx
# Reverse proxy: Nginx escucha en 80 y proxea a la app en 3000.
# Las cabeceras Upgrade/Connection son necesarias para WebSocket
# (subscriptions de GraphQL).
server {
    listen 80;
    server_name api.stocksense.tu-dominio.com;

    # Tamano max del body (uploads de imagenes futuras).
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
```

Reemplazar `api.stocksense.tu-dominio.com` con el subdominio real.

```bash
sudo nginx -t          # validar sintaxis
sudo systemctl reload nginx
```

## 7. HTTPS con Certbot (Let's Encrypt)

```bash
# Instalar certbot
sudo dnf install -y python3 augeas-libs
sudo python3 -m venv /opt/certbot/
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot

# Obtener cert y configurar Nginx automaticamente
sudo certbot --nginx -d api.stocksense.tu-dominio.com
```

Certbot pregunta email (para avisos de expiracion) y agrega los bloques `listen 443 ssl;` al `stocksense.conf`. Renovacion automatica:

```bash
echo "0 3 * * * root /usr/bin/certbot renew --quiet" | sudo tee -a /etc/crontab
```

## 8. Apuntar el dominio

En el panel del proveedor de dominio (Cloudflare, GoDaddy, etc.), crear un registro:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | api (o el subdominio elegido) | IP de la EC2 (Elastic IP si la asignaste) | Auto |

Esperar 5-30 minutos para propagacion DNS. Verificar:

```bash
dig api.stocksense.tu-dominio.com  # debe resolver a la IP de la EC2
curl https://api.stocksense.tu-dominio.com/api/docs
```

## 9. Verificacion y deploy automatizado

Una vez el primer deploy esta funcionando, los siguientes pueden ejecutarse desde tu maquina con el script:

```bash
# Desde la maquina del operador (no en la EC2)
ssh -i stocksense-key.pem ec2-user@<IP> 'bash -s' < scripts/deploy.sh
```

El script hace `git pull`, rebuild y up. Verifica que la app responde en `/api/docs` y muestra logs.

## 10. Alternativa: MongoDB Atlas

Si la EC2 t2.micro va corta de RAM (1 GB), conviene mover Mongo a Atlas Free Tier.

1. Crear cuenta en [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a Cluster -> M0 (Free).
3. Region: la mas cercana a la EC2.
4. Database Access -> Add New Database User. Anotar usuario y password generados.
5. Network Access -> Add IP Address -> agregar la IP publica de la EC2 (o `0.0.0.0/0` temporalmente para testear; restringir despues).
6. Connect -> Connect your application -> copiar la connection string. Formato:
   ```
   mongodb+srv://usuario:password@cluster.xxxxx.mongodb.net/stocksense?retryWrites=true&w=majority
   ```
7. En `.env.production`, reemplazar `MONGO_URI` con esa string.
8. En `docker-compose.prod.yml`, eliminar el service `mongo` y el volume `mongodata-prod`. Tambien remover `mongo: { condition: service_started }` de `depends_on`.

Mongoose soporta `mongodb+srv://` nativamente, no requiere cambios en el codigo.

## 11. Alternativa: PostgreSQL en RDS

RDS db.t3.micro entra en Free Tier durante 12 meses (750h/mes). Mas conveniente que Postgres en Docker (backups automaticos, mantenimiento gestionado), pero consume las horas de compute Free Tier.

1. RDS -> Create database.
2. Engine: PostgreSQL 16.
3. Template: Free tier.
4. DB instance identifier: `stocksense-prod`.
5. Master username: `stocksense_prod` y password (anotar; se usa en `.env.production`).
6. DB instance class: `db.t3.micro`.
7. Storage: 20 GB gp2.
8. **Public access: No** -> el DB solo accesible desde dentro de la VPC.
9. VPC security group: agregar uno que permita el puerto 5432 desde el SG de la EC2.
10. Database name (Additional configuration): `stocksense_prod`.
11. Create database. Anotar el endpoint cuando este disponible.
12. En `.env.production`, setear `DB_HOST` con el endpoint de RDS (formato: `stocksense-prod.xxxx.us-east-1.rds.amazonaws.com`).
13. En `docker-compose.prod.yml`, eliminar el service `postgres` y el volume `pgdata-prod`. Remover `postgres: { condition: service_healthy }` de `depends_on`.

Con esto la app conecta directo al RDS al arrancar y aplica las migrations TypeORM ahi.

## 12. Job nocturno: cron en EC2 vs Lambda

El job `nightly-predictions` recorre todos los duenos activos, ejecuta `predecirReposicion` (calienta el cache de IA y aprovecha el rate limit acumulado de Groq) y dispara emails para los productos con urgencia alta.

### Opcion A: cron en EC2 (recomendado para 1 comercio)

Mas simple. La EC2 ya esta corriendo, no requiere configurar IAM roles ni VPC privada.

1. **Asegurar que el container del app expone `dist/jobs/run-nightly.js`** — ya viene en el build.
2. **Agregar al crontab del usuario `ec2-user`:**

```bash
crontab -e
```

Pegar:

```cron
# Job nocturno StockSense — 6 AM UTC (~3 AM Chile horario standard)
0 6 * * * cd /home/ec2-user/stocksense-backend && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T app node dist/jobs/run-nightly.js >> /var/log/stocksense-nightly.log 2>&1
```

3. **Crear el archivo de log con permisos:**

```bash
sudo touch /var/log/stocksense-nightly.log
sudo chown ec2-user:ec2-user /var/log/stocksense-nightly.log
```

4. **Verificacion manual antes de esperar a las 3 AM:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T app node dist/jobs/run-nightly.js
```

Salida esperada (sample):

```
[Nest] LOG [NightlyPredictionsService] Iniciando job nocturno para 1 dueno(s) activo(s)
[Nest] LOG [NightlyPredictionsService] Alerta procesada: dueno@almacen.com (3 producto(s) urgente(s))
[Nest] LOG [NightlyPredictionsService] Job finalizado: procesados=1 alertas=1 emails=1 errores=0 duracion=4231ms
```

5. **Logrotate** para el log diario:

```bash
sudo tee /etc/logrotate.d/stocksense-nightly <<'EOF'
/var/log/stocksense-nightly.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
EOF
```

### Opcion B: AWS Lambda (cuando hay multiples comercios o se quiere serverless)

Mas complejo pero independiente de la EC2 (si se cae el host del backend, el job sigue funcionando contra RDS/Atlas).

**Pre-requisito:** Postgres en RDS y MongoDB en Atlas (Lambda no puede llegar al Docker local de la EC2 sin abrir puertos).

1. **Build del backend:**

```bash
npm run build
```

2. **Empaquetar Lambda:**

```bash
mkdir -p lambda-package
cp -r dist lambda-package/
cp package.json lambda-package/
cd lambda-package
npm ci --only=production
cd ..
cd lambda-package && zip -r ../stocksense-lambda.zip . && cd ..
```

3. **AWS Console → Lambda → Create function:**
   - Name: `stocksense-nightly-predictions`.
   - Runtime: Node.js 20.x.
   - Architecture: x86_64.
   - **Permissions → Role:** crear nuevo o reusar uno con `AWSLambdaBasicExecutionRole` + `AmazonSESFullAccess` (o policy custom mas restrictiva con solo `ses:SendEmail`).

4. **Subir el zip:** Code → Upload from .zip file → seleccionar `stocksense-lambda.zip`.

5. **Configurar handler:** `dist/jobs/lambda-handler.handler`.

6. **Configuration → General configuration:**
   - Memory: 512 MB.
   - Timeout: **5 minutos** (defecto es 3 segundos; la IA tarda).

7. **Configuration → Environment variables** (todas las del `.env.production` excepto las que apuntan a contenedores):

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DB_HOST` | endpoint del RDS |
   | `DB_PORT` | 5432 |
   | `DB_USERNAME` | usuario RDS |
   | `DB_PASSWORD` | password RDS |
   | `DB_NAME` | nombre BD |
   | `MONGO_URI` | string completa del Atlas |
   | `JWT_SECRET` | el mismo del backend |
   | `GROQ_API_KEY` | clave de Groq |
   | `AWS_SES_REGION` | `us-east-1` |
   | `AWS_SES_FROM_EMAIL` | `alertas@stocksense.tu-dominio.com` |
   | `FRONTEND_URL` | URL de Vercel |

8. **Configuration → VPC** (solo si RDS es privado): asociar la Lambda a la VPC del RDS, subnets privadas, y un security group que el RDS acepte. **Esto evita que la Lambda salga a internet** — si necesita Groq y SES, agregar NAT Gateway o VPC endpoints.

9. **EventBridge schedule:**
   - Console → Amazon EventBridge → Schedules → Create.
   - Schedule pattern: `cron(0 6 * * ? *)` (6 AM UTC, todos los dias).
   - Target: la Lambda creada.
   - Permissions: crear role nuevo (auto).

10. **Test manual** desde la consola de Lambda (Test → New event → `{}`):
    - Si retorna `{ ok: true, resumen: { ... } }` → todo bien.
    - Si retorna `{ ok: false, error: "..." }` → revisar CloudWatch Logs.

### Cual elegir

| Criterio | Cron EC2 | Lambda |
|---|---|---|
| Setup | 5 min | 30-60 min |
| Costo (1 comercio) | $0 (incluido en EC2) | $0 (1 ejecucion/dia entra en free tier) |
| Independencia de la EC2 | No — si se cae el app, el job tambien | Si — Lambda es separada |
| Visibilidad | `/var/log/stocksense-nightly.log` + SSH | CloudWatch Logs |
| Escala | Limitada (CPU de la t2.micro) | Hasta 15 minutos por ejecucion, paralelizable |
| Cuando elegirla | 1 comercio, todo en 1 EC2 | Multi-comercio, BD externa, alta disponibilidad |

**Recomendacion para esta version:** cron en EC2. Lambda se justifica cuando hay >5 comercios activos o cuando el RDS no esta en la misma EC2.

## 13. Emails de alerta con AWS SES

El servicio `NotificationsService` usa SES para enviar emails de alerta cuando el job nocturno detecta productos urgentes.

### Setup inicial

1. **AWS Console → Amazon SES → Verified identities → Create identity:**
   - Identity type: **Domain** (recomendado) o Email address.
   - Domain: `stocksense.tu-dominio.com`.
   - DKIM: Easy DKIM, RSA 2048-bit.
   - Click **Create identity**.

2. **Configurar DNS** del dominio: SES muestra 3 registros CNAME para DKIM. Agregarlos en el panel del proveedor de dominio.

3. **Esperar verificacion** (5-30 min). Estado pasa a **Verified**.

4. **Salir del sandbox** (opcional pero recomendado):
   - Por defecto SES esta en sandbox: solo se puede enviar a emails verificados, max 200 emails/dia, 1 email/segundo.
   - **Account dashboard → Request production access** → completar el form (caso de uso, frecuencia esperada). Aprobacion: 24-48 horas.
   - En sandbox alcanza para empezar: verificar el email del operador como destino.

### Instalar el SDK en el backend

El paquete `@aws-sdk/client-ses` se importa dinamicamente por el `NotificationsService` solo si `NODE_ENV === 'production'` y `AWS_SES_REGION` esta seteado. Para que funcione en produccion:

```bash
# En la EC2, dentro del directorio del repo
npm install @aws-sdk/client-ses --save

# Rebuildear el container
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Variables de entorno

Agregar al `.env.production`:

```env
# AWS SES — emails de alerta del job nocturno
AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=alertas@stocksense.tu-dominio.com
```

### Credenciales

**Si la app corre en EC2 con IAM role:**
- Asociar a la EC2 un role con la policy `AmazonSESFullAccess` (o una mas restrictiva con solo `ses:SendEmail`).
- El SDK toma las credenciales del metadata service automaticamente. **No agregar `AWS_ACCESS_KEY_ID` al `.env.production`**.

**Si la app corre en Lambda:** el role de la Lambda ya tiene los permisos (paso 12.B.3).

**Si se prueba localmente con SES** (no recomendado, pero util):

```env
AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

Generar las credenciales en IAM → Users → Add user con la policy `AmazonSESFullAccess`. **No commitear estas credenciales.**

### Verificar el envio

1. **Forzar un run del job manualmente:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T app node dist/jobs/run-nightly.js
```

2. **Si hay alertas, llega un email** con el listado de productos urgentes.
3. **CloudWatch Logs (si Lambda) o stdout** muestra: `Email enviado a dueno@almacen.com (3 productos)`.

### Troubleshooting SES

**`MessageRejected: Email address is not verified`.**
- En sandbox, verificar el email del destinatario (`SES → Verified identities → Create identity → Email`).
- Para produccion real, salir del sandbox.

**`AccessDenied` al enviar.**
- IAM role de la EC2/Lambda no tiene `ses:SendEmail` en la policy.

**El email llega a spam.**
- Configurar SPF, DKIM (auto con Easy DKIM) y DMARC en el DNS del dominio.
- Usar un from-address con dominio propio (`alertas@stocksense.tu-dominio.com`), no genericos como `noreply@gmail.com`.

## 14. Troubleshooting

**La app no levanta. Logs muestran `ECONNREFUSED` a Postgres.**
- En `.env.production`, `DB_HOST=postgres` (nombre del servicio en compose), no `localhost`.
- Si se usa RDS: verificar que el SG del RDS permite 5432 desde el SG de la EC2.

**`502 Bad Gateway` al pegar al dominio.**
- La app no esta corriendo o no escucha en 3000. `docker compose -f docker-compose.prod.yml ps`.
- SELinux puede bloquear el proxy de Nginx a localhost: `sudo setsebool -P httpd_can_network_connect 1`.

**WebSocket de subscriptions GraphQL no conecta.**
- Verificar las cabeceras `Upgrade`/`Connection` en `/etc/nginx/conf.d/stocksense.conf`.
- Certbot a veces remueve esas headers al editar el archivo: revisar tras correr `certbot --nginx`.

**Deploy con migrations falla con "extension uuid-ossp not allowed".**
- En RDS, conectarse al DB y ejecutar manualmente: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` con un usuario con permisos rds_superuser.

**EC2 t2.micro se queda sin memoria al hacer build.**
- Crear swap antes del build:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "/swapfile swap swap defaults 0 0" | sudo tee -a /etc/fstab
  ```

**Logs ocupan demasiado disco.**
- Configurar log rotation en `/etc/docker/daemon.json`:
  ```json
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "3"
    }
  }
  ```
  Reiniciar: `sudo systemctl restart docker`.
