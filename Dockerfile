FROM node:21.2.0 AS client
WORKDIR /app

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/. ./
RUN npm run build


FROM docker.io/golang:1.18-alpine AS binary
ENV DOCKER=1

# Download dependencies in early layer, as these rarely change
COPY server/go.mod server/go.sum /app/server/
RUN cd /app/server && go mod download

COPY server/. /app/server/.
COPY --from=client /server/webapp/ /app/server/webapp/
RUN cd /app/server && go build -o /app/rdio-scanner


FROM docker.io/alpine:latest AS app
ENV DOCKER=1
WORKDIR /app
RUN apk --no-cache --no-progress add ffmpeg mailcap tzdata
RUN mkdir -p /app/data
COPY --from=binary /app/rdio-scanner .

VOLUME [ "/app/data" ]
EXPOSE 3000
ENTRYPOINT [ "./rdio-scanner", "-base_dir", "/app/data" ]
