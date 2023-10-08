"""
This module contains a Caribou migration.

Migration Name: irc_channels 
Migration Version: 20231008094814
"""


def upgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS channels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          create_time INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def downgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        DROP TABLE IF EXISTS channels;
        """
    )
