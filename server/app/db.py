from collections.abc import AsyncIterator

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings

# min_size is also the default max, which is 4. Matching holds two of those for a whole run (its
# connection, and the live transcript writer), so the world snapshot and chat stream were waiting on
# the 30s pool timeout. Reads need room beside those two.
pool = AsyncConnectionPool(
    get_settings().database_url,
    kwargs={"row_factory": dict_row},
    min_size=4,
    max_size=16,
    timeout=8,
    open=False,
)


async def get_conn() -> AsyncIterator[AsyncConnection]:
    async with pool.connection() as conn:
        yield conn
