FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf.bak
