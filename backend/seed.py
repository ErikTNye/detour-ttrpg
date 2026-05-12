"""
Insert private access codes into the voting database.

Create an access-codes.txt file in the project root:
    code,label

Example:
    iron-tide-9,Player 1
    amber-wolf-47,Player 2

Then run:
    python3 backend/seed.py
"""

import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "votes.db"
CODES_PATH = PROJECT_ROOT / "private" / "access-codes.txt"


def load_codes() -> list[tuple[str, str]]:
    if not CODES_PATH.exists():
        raise FileNotFoundError(
            f"Access code file not found at {CODES_PATH}.\n"
            "Create access-codes.txt in the project root first."
        )

    codes: list[tuple[str, str]] = []

    for line_number, raw_line in enumerate(
        CODES_PATH.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if "," not in line:
            raise ValueError(
                f"Invalid line {line_number} in access-codes.txt: {raw_line!r}\n"
                "Expected format: code,label"
            )

        code, label = (part.strip() for part in line.split(",", maxsplit=1))

        if not code:
            raise ValueError(
                f"Invalid line {line_number}: access code cannot be empty."
            )

        if not label:
            raise ValueError(
                f"Invalid line {line_number}: label cannot be empty."
            )

        codes.append((code, label))

    if not codes:
        raise ValueError("No access codes found in access-codes.txt.")

    return codes


def seed() -> None:
    if not DB_PATH.exists():
        print(
            f"Database not found at {DB_PATH}.\n"
            "Start the backend once first so it creates the database and tables."
        )
        return

    try:
        codes = load_codes()
    except (FileNotFoundError, ValueError) as exc:
        print(exc)
        return

    conn = sqlite3.connect(DB_PATH)
    added = 0

    try:
        for code, label in codes:
            try:
                conn.execute(
                    "INSERT INTO access_codes (code, label) VALUES (?, ?)",
                    (code, label),
                )
                print(f"  added: {code!r:22} ({label})")
                added += 1
            except sqlite3.IntegrityError:
                print(f"  skip (exists): {code!r}")

        conn.commit()
    finally:
        conn.close()

    print(f"\nDone — {added} code(s) added.")


if __name__ == "__main__":
    seed()