#!/usr/bin/env bash
# deploy.sh — разворачивает «Не вордли» на Ubuntu 20.04
# Запускать от пользователя с sudo: bash deploy.sh
set -euo pipefail

DOMAIN="dontwordle.ru"
WWW_DOMAIN="www.dontwordle.ru"
REPO="https://github.com/NikitaMikhailov/dontwordle-ru.git"
WEBROOT="/var/www/${DOMAIN}"
EMAIL="mikhailov_nikita1997@icloud.com"   # для Let's Encrypt уведомлений

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}   $*"; }

# ── 1. Nginx ────────────────────────────────────────────────────────────────
log "Устанавливаю nginx..."
sudo apt-get update -qq
sudo apt-get install -y nginx

sudo systemctl enable nginx
sudo systemctl start nginx
log "nginx $(nginx -v 2>&1) — запущен"

# ── 2. Клонируем репо ───────────────────────────────────────────────────────
log "Клонирую репозиторий в ${WEBROOT}..."
if [ -d "${WEBROOT}/.git" ]; then
  warn "Директория уже существует — делаю git pull"
  sudo git -C "${WEBROOT}" pull
else
  sudo git clone "${REPO}" "${WEBROOT}"
fi
sudo chown -R www-data:www-data "${WEBROOT}"
sudo chmod -R 755 "${WEBROOT}"
log "Файлы игры готовы"

# ── 3. Nginx конфиг (HTTP, пока без SSL) ────────────────────────────────────
log "Пишу nginx конфиг..."
sudo tee /etc/nginx/sites-available/${DOMAIN} > /dev/null << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEBROOT};
    index index.html;

    # Логи
    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log  /var/log/nginx/${DOMAIN}.error.log;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/javascript application/json
               image/svg+xml;
    gzip_min_length 1024;

    # Кэш статики
    location ~* \.(css|js|json|png|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # SPA — все пути на index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Закрываем .git и скрипты
    location ~ /\.(git|env) {
        deny all;
        return 404;
    }
    location ^~ /scripts/ {
        deny all;
        return 404;
    }
}
NGINX

# Активируем сайт
sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
sudo rm -f /etc/nginx/sites-enabled/default

# Проверяем конфиг
sudo nginx -t
sudo systemctl reload nginx
log "nginx конфиг применён (HTTP)"

# ── 4. SSL через Let's Encrypt ──────────────────────────────────────────────
log "Настраиваю SSL (certbot)..."

# certbot 0.40 — используем certbot-auto или пакет
if ! command -v certbot &>/dev/null; then
  sudo apt-get install -y certbot python3-certbot-nginx
fi

# Получаем сертификат
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --domains "${DOMAIN},${WWW_DOMAIN}" \
  --redirect

# Авторенью (уже настроено в systemd timer, проверяем)
sudo systemctl enable certbot.timer 2>/dev/null || true
log "SSL сертификат получен и настроен"

# ── 5. Финальный nginx конфиг с заголовками безопасности ───────────────────
log "Дописываю security headers в конфиг..."
sudo tee /etc/nginx/sites-available/${DOMAIN} > /dev/null << NGINX
# HTTP → HTTPS редирект
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};
    return 301 https://${DOMAIN}\$request_uri;
}

# www → без www
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${WWW_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://${DOMAIN}\$request_uri;
}

# Основной сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root  ${WEBROOT};
    index index.html;

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log  /var/log/nginx/${DOMAIN}.error.log;

    # Security headers
    add_header X-Frame-Options           "SAMEORIGIN"            always;
    add_header X-Content-Type-Options    "nosniff"               always;
    add_header X-XSS-Protection          "1; mode=block"         always;
    add_header Referrer-Policy           "strict-origin"         always;
    add_header Permissions-Policy        "geolocation=(), camera=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://vfrsute.ru;" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/javascript application/json
               image/svg+xml application/font-woff2;
    gzip_min_length 1024;

    # Кэш статики
    location ~* \.(css|js|json|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Запрещаем лишнее
    location ~ /\.(git|env|htaccess) {
        deny all; return 404;
    }
    location ^~ /scripts/ {
        deny all; return 404;
    }
}
NGINX

sudo nginx -t
sudo systemctl reload nginx

# ── 6. Скрипт обновления ────────────────────────────────────────────────────
sudo tee /usr/local/bin/nevordli-update > /dev/null << 'UPDATER'
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/dontwordle.ru
sudo git pull
sudo chown -R www-data:www-data .
echo "[$(date)] Обновлено успешно"
UPDATER
sudo chmod +x /usr/local/bin/nevordli-update

# ── Готово ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Готово! Игра доступна на:${NC}"
echo -e "${GREEN}  https://${DOMAIN}${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Обновить игру позже: sudo nevordli-update"
echo "Логи nginx:          sudo tail -f /var/log/nginx/${DOMAIN}.error.log"
