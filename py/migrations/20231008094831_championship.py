"""
This module contains a Caribou migration.

Migration Name: championship 
Migration Version: 20231008094831
"""


def upgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS championship_standings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data JSON NOT NULL,
          type INTEGER NOT NULL UNIQUE,
          create_time INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def downgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        DROP TABLE IF EXISTS championship_standings;
        """
    )
