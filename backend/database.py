import os
import sqlite3
from contextlib import closing
from pathlib import Path

_here = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DB_PATH", str(_here.parent / "data" / "votes.db")))

SYSTEM_IDS = (
    "deadlands",
    "twilight2000",
    "starfinder2e",
    "cyberpunk_red",
)

SYSTEMS = set(SYSTEM_IDS)
POINTS = {0: 4, 1: 3, 2: 2, 3: 1}  # index → points (rank_1 = index 0 = 4pts)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with closing(get_db()) as conn:
        conn.execute("PRAGMA journal_mode = WAL")

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS access_codes (
                id         INTEGER PRIMARY KEY,
                code       TEXT UNIQUE NOT NULL,
                label      TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used_at    TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS votes (
                id       INTEGER PRIMARY KEY,
                code_id  INTEGER NOT NULL UNIQUE REFERENCES access_codes(id),

                rank_1   TEXT NOT NULL CHECK (
                    rank_1 IN ('deadlands', 'twilight2000', 'starfinder2e', 'cyberpunk_red')
                ),
                rank_2   TEXT NOT NULL CHECK (
                    rank_2 IN ('deadlands', 'twilight2000', 'starfinder2e', 'cyberpunk_red')
                ),
                rank_3   TEXT NOT NULL CHECK (
                    rank_3 IN ('deadlands', 'twilight2000', 'starfinder2e', 'cyberpunk_red')
                ),
                rank_4   TEXT NOT NULL CHECK (
                    rank_4 IN ('deadlands', 'twilight2000', 'starfinder2e', 'cyberpunk_red')
                ),

                voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CHECK (rank_1 <> rank_2),
                CHECK (rank_1 <> rank_3),
                CHECK (rank_1 <> rank_4),
                CHECK (rank_2 <> rank_3),
                CHECK (rank_2 <> rank_4),
                CHECK (rank_3 <> rank_4)
            );
        """)
