FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/conf.d/default.conf.bak

ARG BUILD_HASH=dev
RUN sed -i "s/__BUILD_HASH__/${BUILD_HASH}/g" \
      /usr/share/nginx/html/index.html \
      /usr/share/nginx/html/js/app.js
