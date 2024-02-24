FROM rust:latest as builder

# Make a fake Rust app to keep a cached layer of compiled crates
RUN USER=root cargo new app
WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock ./

RUN mkdir src && echo "fn main(){}" > src/main.rs

RUN cargo build --release

COPY . .

RUN cargo build --release

FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y \
    libc6 \
    libgcc1 \
    libstdc++6

RUN useradd -ms /bin/bash app
USER app
WORKDIR /app

COPY --from=builder /usr/src/app/target/release/HamVerBot .

CMD ["./HamVerBot"]
