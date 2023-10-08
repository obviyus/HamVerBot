import sqlite3

import caribou

MIGRATIONS_DIR = "migrations"

caribou.upgrade("./HamVerBot.sqlite", MIGRATIONS_DIR)

conn = sqlite3.connect(
    "HamVerBot.sqlite",
    check_same_thread=False,
    isolation_level=None,
)

conn.row_factory = sqlite3.Row
