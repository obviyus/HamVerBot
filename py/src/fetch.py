import codecs
import json

import aiohttp

from .db import conn

F1_API_ENDPOINT = "https://api.formula1.com/v1/event-tracker"
F1_SESSION_ENDPOINT = "https://livetiming.formula1.com/static"
ERGAST_API_ENDPOINT = "https://ergast.com/api/f1"


async def fetch_and_store_driver_list(path: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{F1_API_ENDPOINT}/{path}") as response:
            content = await response.read()
            data = json.loads(codecs.decode(content, "utf-8"))

    for racing_number, driver_data in data.items():
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO
              driver_list (racing_number, reference, first_name, last_name, full_name, broadcast_name, tla, country_code, team_name, team_colour)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (racing_number) DO UPDATE SET
              reference = excluded.reference,
              first_name = excluded.first_name,
              last_name = excluded.last_name,
              full_name = excluded.full_name,
              broadcast_name = excluded.broadcast_name,
              tla = excluded.tla,
              country_code = excluded.country_code,
              team_name = excluded.team_name,
              team_colour = excluded.team_colour
            """,
            (
                racing_number,
                driver_data["Reference"],
                driver_data["FirstName"],
                driver_data["LastName"],
                driver_data["FullName"],
                driver_data["BroadcastName"],
                driver_data["Tla"],
                driver_data["CountryCode"],
                driver_data["TeamName"],
                driver_data["TeamColour"],
            ),
        )


async def fetch_wdc_standings():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{F1_SESSION_ENDPOINT}/drivers.json") as response:
            data = response.json()

    for standing in data["MRData"]["StandingsTable"]["StandingsLists"][0][
        "DriverStandings"
    ]:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO
              championship_standings (data, type)
            VALUES
              (?, 0)
            ON CONFLICT (type) DO UPDATE SET
              data = excluded.data
            """,
            (json.dumps(standing),),
        )


async def fetch_wcc_standings():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{F1_SESSION_ENDPOINT}/constructors.json") as response:
            data = response.json()

    for standing in data["MRData"]["StandingsTable"]["StandingsLists"][0][
        "ConstructorStandings"
    ]:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO
              championship_standings (data, type)
            VALUES
              (?, 1)
            ON CONFLICT (type) DO UPDATE SET
              data = excluded.data
            """,
            (json.dumps(standing),),
        )
