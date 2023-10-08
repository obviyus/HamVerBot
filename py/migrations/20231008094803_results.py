"""
This module contains a Caribou migration.

Migration Name: results 
Migration Version: 20231008094803
"""


def upgrade(connection):
    cursor = connection.cursor()
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          meeting_name TEXT NOT NULL,
          event_type_id INTEGER NOT NULL,
          start_time INTEGER NOT NULL,
          FOREIGN KEY (event_type_id) REFERENCES event_type (id)
        );
        """
    )


def downgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        DROP TABLE IF EXISTS events;
        """
    )
