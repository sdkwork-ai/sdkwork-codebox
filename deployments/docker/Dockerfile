FROM rust:1-bookworm AS builder
WORKDIR /src
COPY . .
RUN cargo build --release -p sdkwork-api-codebox-standalone-gateway

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /src/target/release/sdkwork-api-codebox-standalone-gateway /usr/local/bin/sdkwork-api-codebox-standalone-gateway
ENV SDKWORK_CODEBOX_APPLICATION_PUBLIC_INGRESS_BIND=0.0.0.0:8080
EXPOSE 8080
CMD ["sdkwork-api-codebox-standalone-gateway"]
