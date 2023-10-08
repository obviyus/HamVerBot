"""
This module contains a Caribou migration.

Migration Name: driver_list 
Migration Version: 20231008094840
"""


def upgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_list (
          racing_number INTEGER NOT NULL PRIMARY KEY,
          reference VARCHAR(255) NOT NULL,
          first_name VARCHAR(255) NOT NULL,
          last_name VARCHAR(255) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          broadcast_name VARCHAR(255) NOT NULL,
          tla VARCHAR(255) NOT NULL,
          country_code VARCHAR(255) NOT NULL,
          team_name VARCHAR(255) NOT NULL,
          team_colour VARCHAR(255) NOT NULL
        );
        """
    )


def downgrade(connection):
    cursor = connection.cursor()
    cursor.execute(
        """
        DROP TABLE IF EXISTS driver_list;
        """
    )
