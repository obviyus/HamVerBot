"""
This module contains a Caribou migration.

Migration Name: event_type 
Migration Version: 20231008092653
"""


def upgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS event_type
        (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL
        );
        """
    )

    cursor.execute(
        """
        INSERT INTO
          event_type (name)
        VALUES
          ('Livery Reveal'),
          ('Practice 1'),
          ('Practice 2'),
          ('Practice 3'),
          ('Qualifying'),
          ('Sprint Shootout'),
          ('Sprint Race'),
          ('Race');
        """
    )


def downgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        DROP TABLE IF EXISTS event_type;
        """
    )
