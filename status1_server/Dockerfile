ARG BUILD_FROM
FROM $BUILD_FROM
RUN apk add --no-cache python3
COPY rootfs /
WORKDIR /srv/status1
CMD ["python3", "-u", "/srv/status1/server.py"]
