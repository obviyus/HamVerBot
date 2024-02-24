FROM rust:latest as builder

WORKDIR /app

COPY . .

RUN cargo build --release

CMD ["/app/target/release/HamVerBot"]
