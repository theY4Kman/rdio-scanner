FROM docker.io/alpine:latest AS builder
LABEL maintainer="Chrystian Huot <chrystian.huot@saubeo.solutions>"
ENV DOCKER=1

# Install build dependencies
RUN apk --no-cache --no-progress --virtual .build add go

# Download dependencies in early layer, as these rarely change
COPY server/go.mod server/go.sum /app/server/
WORKDIR /app/server
RUN go mod download

COPY server/. /app/server/.
RUN go build -o /app/rdio-scanner

FROM docker.io/alpine:latest AS app
LABEL maintainer="Chrystian Huot <chrystian.huot@saubeo.solutions>"
WORKDIR /app
ENV DOCKER=1
RUN apk --no-cache --no-progress add ffmpeg mailcap tzdata
RUN mkdir -p /app/data
COPY --from=builder /app/rdio-scanner .

VOLUME [ "/app/data" ]
EXPOSE 3000
ENTRYPOINT [ "./rdio-scanner", "-base_dir", "/app/data" ]