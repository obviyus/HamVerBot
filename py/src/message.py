from enum import Enum

class DisplayType(Enum):
    """
    Enum class to represent the different message backends.
    """
    IRC = 1
    DISCORD = 2
    TELEGRAM = 3


async def display_wcc_standings(data, display_type: DisplayType) -> str:
    """
    Helper function to format the WCC standings into a given format.
    :param data:
    :return:
    """
    output = ""

    match display_type:
        case DisplayType.IRC:
            output = f"🏆 \x02 FORMULA 1 {data['MRData']} WDC Standings\x02:",