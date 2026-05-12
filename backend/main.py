import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from database import POINTS, SYSTEM_IDS, SYSTEMS, get_db, init_db

_here = Path(__file__).resolve().parent
FRONTEND_DIR = os.getenv("FRONTEND_DIR", str(_here.parent / "frontend"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)


class VoteRequest(BaseModel):
    code: str
    ranking: list[str]  # [rank_1, rank_2, rank_3, rank_4] — first is most preferred

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Access code cannot be empty")
        return cleaned

    @field_validator("ranking")
    @classmethod
    def validate_ranking(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError("Must rank all 4 systems")

        if set(v) != SYSTEMS:
            raise ValueError(f"Invalid systems. Expected: {SYSTEM_IDS}")

        return v


@app.get("/api/vote-count")
def get_vote_count():
    with get_db() as db:
        votes_cast = db.execute("SELECT COUNT(*) AS n FROM votes").fetchone()["n"]
        total_codes = db.execute("SELECT COUNT(*) AS n FROM access_codes").fetchone()["n"]

    return {
        "votes_cast": votes_cast,
        "total_codes": total_codes,
    }


@app.get("/api/status/{code}")
def get_status(code: str):
    code = code.strip()

    if not code:
        raise HTTPException(status_code=404, detail="Invalid code")

    with get_db() as db:
        row = db.execute(
            "SELECT id, used_at FROM access_codes WHERE code = ?",
            (code,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Invalid code")

    return {
        "valid": True,
        "voted": row["used_at"] is not None,
    }


@app.post("/api/vote")
def submit_vote(vote: VoteRequest):
    with get_db() as db:
        row = db.execute(
            "SELECT id, used_at FROM access_codes WHERE code = ?",
            (vote.code,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Invalid code")

        if row["used_at"] is not None:
            raise HTTPException(status_code=409, detail="Code already used")

        try:
            db.execute(
                """
                INSERT INTO votes (
                    code_id,
                    rank_1,
                    rank_2,
                    rank_3,
                    rank_4
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (row["id"], *vote.ranking),
            )

            db.execute(
                """
                UPDATE access_codes
                SET used_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (row["id"],),
            )

        except sqlite3.IntegrityError:
            # Covers the unlikely double-submit / race case
            # if UNIQUE(code_id) exists on the votes table.
            raise HTTPException(status_code=409, detail="Code already used")

    return {"success": True}


@app.get("/api/results/{code}")
def get_results(code: str):
    code = code.strip()

    if not code:
        raise HTTPException(status_code=404, detail="Invalid code")

    with get_db() as db:
        access_code = db.execute(
            "SELECT used_at FROM access_codes WHERE code = ?",
            (code,),
        ).fetchone()

        if not access_code:
            raise HTTPException(status_code=404, detail="Invalid code")

        if access_code["used_at"] is None:
            raise HTTPException(
                status_code=403,
                detail="Vote first to view results",
            )

        votes = db.execute(
            """
            SELECT rank_1, rank_2, rank_3, rank_4
            FROM votes
            """
        ).fetchall()

        voted_labels = [
            row["label"]
            for row in db.execute(
                """
                SELECT ac.label FROM access_codes ac
                JOIN votes v ON ac.id = v.code_id
                ORDER BY v.voted_at ASC
                """
            ).fetchall()
            if row["label"]
        ]

        total_codes = db.execute(
            "SELECT COUNT(*) AS n FROM access_codes"
        ).fetchone()["n"]

    scores = {system: 0 for system in SYSTEM_IDS}
    distribution = {
        system: {"rank_1": 0, "rank_2": 0, "rank_3": 0, "rank_4": 0}
        for system in SYSTEM_IDS
    }

    for row in votes:
        ranked_systems = (
            row["rank_1"],
            row["rank_2"],
            row["rank_3"],
            row["rank_4"],
        )

        for index, system in enumerate(ranked_systems):
            points = POINTS[index]
            scores[system] += points
            rank_key = f"rank_{index + 1}"
            distribution[system][rank_key] += 1

    ranking = sorted(
        scores.items(),
        key=lambda item: (-item[1], SYSTEM_IDS.index(item[0])),
    )

    return {
        "votes_cast": len(votes),
        "total_codes": total_codes,
        "voted_labels": voted_labels,
        "scores": [
            {"system": system, "points": points}
            for system, points in ranking
        ],
        "distribution": distribution,
    }


# Serve frontend — must come after all API routes
app.mount(
    "/",
    StaticFiles(directory=FRONTEND_DIR, html=True),
    name="static",
)
