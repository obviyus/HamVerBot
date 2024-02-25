FROM rust:slim-bookworm as builder

WORKDIR /app

RUN USER=root cargo new --bin HamVerBot
WORKDIR /app/HamVerBot

# Copy only the dependency manifests to cache dependencies
COPY ./Cargo.toml ./Cargo.toml

RUN cargo build --release

COPY . .

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/HamVerBot/target/release/HamVerBot .

# Run the application
CMD ["./HamVerBot"]
