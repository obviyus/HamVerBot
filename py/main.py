import asyncio
from src.fetch import (
    fetch_and_store_driver_list,
    fetch_wcc_standings,
    fetch_wdc_standings,
)

from irctokens import build, Line
from ircrobots import Bot as BaseBot
from ircrobots import Server as BaseServer
from ircrobots import ConnectionParams

SERVERS = [("libera", "irc.libera.chat")]


class Server(BaseServer):
    async def line_read(self, line: Line):
        print(f"{self.name} < {line.format()}")
        if line.command == "001":
            print(f"connected to {self.isupport.network}")
            await self.send(build("JOIN", ["#obviyus"]))

    async def line_send(self, line: Line):
        print(f"{self.name} > {line.format()}")


class Bot(BaseBot):
    def create_server(self, name: str):
        return Server(self, name)


async def main():
    bot = Bot()
    for name, host in SERVERS:
        params = ConnectionParams("HamVerBotPy", host, 6697)
        await bot.add_server(name, params)

    await bot.run()


if __name__ == "__main__":
    asyncio.run(
        fetch_and_store_driver_list(
            "2023/2023-10-08_Qatar_Grand_Prix/2023-10-06_Qualifying/"
        )
    )
    asyncio.run(fetch_wcc_standings())
    asyncio.run(fetch_wdc_standings())
