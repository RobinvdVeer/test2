FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

COPY --chown=101:101 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 public/ /usr/share/nginx/html/
RUN mkdir -p /var/cache/nginx /run && chown -R 101:101 /var/cache/nginx /run

USER 101
EXPOSE 8080
