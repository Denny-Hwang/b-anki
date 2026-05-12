"""SQLite persistence for users, card review state, and session history."""
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date, datetime
from typing import Iterable

from . import config
from .srs import CardState

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _cursor():
    with _lock:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db() -> None:
    with _cursor() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS card_reviews (
                user_id INTEGER NOT NULL,
                set_name TEXT NOT NULL,
                location TEXT NOT NULL,
                ease REAL NOT NULL,
                interval_days INTEGER NOT NULL,
                repetitions INTEGER NOT NULL,
                lapses INTEGER NOT NULL,
                last_reviewed DATE,
                due_date DATE,
                PRIMARY KEY (user_id, set_name, location),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS review_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                set_name TEXT NOT NULL,
                location TEXT NOT NULL,
                rating INTEGER NOT NULL,
                score INTEGER,
                reviewed_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                set_name TEXT NOT NULL,
                mode TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                cards_reviewed INTEGER DEFAULT 0,
                avg_score REAL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_review_log_user_date
                ON review_log(user_id, reviewed_at);
            CREATE INDEX IF NOT EXISTS idx_card_reviews_due
                ON card_reviews(user_id, set_name, due_date);
            """
        )


def get_or_create_user(name: str) -> int:
    name = (name or "").strip() or "익명"
    with _cursor() as conn:
        cur = conn.execute("SELECT id FROM users WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            return row["id"]
        cur = conn.execute(
            "INSERT INTO users (name, created_at) VALUES (?, ?)",
            (name, datetime.utcnow().isoformat()),
        )
        return cur.lastrowid


def list_users() -> list[dict]:
    with _cursor() as conn:
        cur = conn.execute("SELECT id, name, created_at FROM users ORDER BY name")
        return [dict(r) for r in cur.fetchall()]


def get_card_state(user_id: int, set_name: str, location: str) -> CardState:
    with _cursor() as conn:
        cur = conn.execute(
            """SELECT ease, interval_days, repetitions, lapses, last_reviewed, due_date
               FROM card_reviews WHERE user_id=? AND set_name=? AND location=?""",
            (user_id, set_name, location),
        )
        row = cur.fetchone()
    if not row:
        return CardState()
    return CardState(
        ease=row["ease"],
        interval_days=row["interval_days"],
        repetitions=row["repetitions"],
        lapses=row["lapses"],
        last_reviewed=row["last_reviewed"],
        due_date=row["due_date"],
    )


def load_card_states(user_id: int, set_name: str, locations: Iterable[str]) -> dict[str, CardState]:
    locations = list(locations)
    if not locations:
        return {}
    placeholders = ",".join("?" * len(locations))
    query = f"""SELECT location, ease, interval_days, repetitions, lapses, last_reviewed, due_date
                FROM card_reviews
                WHERE user_id=? AND set_name=? AND location IN ({placeholders})"""
    params = [user_id, set_name, *locations]
    with _cursor() as conn:
        cur = conn.execute(query, params)
        rows = cur.fetchall()
    result: dict[str, CardState] = {}
    for r in rows:
        result[r["location"]] = CardState(
            ease=r["ease"],
            interval_days=r["interval_days"],
            repetitions=r["repetitions"],
            lapses=r["lapses"],
            last_reviewed=r["last_reviewed"],
            due_date=r["due_date"],
        )
    return result


def save_card_state(user_id: int, set_name: str, location: str, state: CardState) -> None:
    with _cursor() as conn:
        conn.execute(
            """INSERT INTO card_reviews
                  (user_id, set_name, location, ease, interval_days, repetitions, lapses, last_reviewed, due_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, set_name, location) DO UPDATE SET
                  ease=excluded.ease,
                  interval_days=excluded.interval_days,
                  repetitions=excluded.repetitions,
                  lapses=excluded.lapses,
                  last_reviewed=excluded.last_reviewed,
                  due_date=excluded.due_date""",
            (
                user_id, set_name, location,
                state.ease, state.interval_days, state.repetitions, state.lapses,
                state.last_reviewed, state.due_date,
            ),
        )


def log_review(user_id: int, set_name: str, location: str, rating: int, score: int | None) -> None:
    with _cursor() as conn:
        conn.execute(
            """INSERT INTO review_log (user_id, set_name, location, rating, score, reviewed_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, set_name, location, rating, score, datetime.utcnow().isoformat()),
        )


def start_session(user_id: int, set_name: str, mode: str) -> int:
    with _cursor() as conn:
        cur = conn.execute(
            """INSERT INTO sessions (user_id, set_name, mode, started_at) VALUES (?, ?, ?, ?)""",
            (user_id, set_name, mode, datetime.utcnow().isoformat()),
        )
        return cur.lastrowid


def end_session(session_id: int, cards_reviewed: int, avg_score: float | None) -> None:
    with _cursor() as conn:
        conn.execute(
            """UPDATE sessions SET ended_at=?, cards_reviewed=?, avg_score=? WHERE id=?""",
            (datetime.utcnow().isoformat(), cards_reviewed, avg_score, session_id),
        )


def get_due_count(user_id: int, set_name: str, today: date | None = None) -> int:
    today = today or date.today()
    with _cursor() as conn:
        cur = conn.execute(
            """SELECT COUNT(*) AS n FROM card_reviews
               WHERE user_id=? AND set_name=? AND due_date <= ?""",
            (user_id, set_name, today),
        )
        return cur.fetchone()["n"]


def get_user_stats(user_id: int) -> dict:
    with _cursor() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM review_log WHERE user_id=?", (user_id,)
        ).fetchone()["n"]

        cards = conn.execute(
            "SELECT COUNT(DISTINCT location) AS n FROM card_reviews WHERE user_id=?", (user_id,)
        ).fetchone()["n"]

        accuracy = conn.execute(
            """SELECT AVG(score) AS avg_score FROM review_log
               WHERE user_id=? AND score IS NOT NULL""",
            (user_id,),
        ).fetchone()["avg_score"]

        per_day = conn.execute(
            """SELECT DATE(reviewed_at) AS d, COUNT(*) AS n
               FROM review_log WHERE user_id=?
               GROUP BY DATE(reviewed_at) ORDER BY d""",
            (user_id,),
        ).fetchall()

        sessions = conn.execute(
            """SELECT id, set_name, mode, started_at, ended_at, cards_reviewed, avg_score
               FROM sessions WHERE user_id=? AND ended_at IS NOT NULL
               ORDER BY started_at DESC LIMIT 30""",
            (user_id,),
        ).fetchall()

    return {
        "total_reviews": total,
        "cards_seen": cards,
        "avg_accuracy": round(accuracy) if accuracy is not None else None,
        "per_day": [{"date": r["d"], "count": r["n"]} for r in per_day],
        "sessions": [dict(r) for r in sessions],
    }


def compute_streak(user_id: int) -> int:
    with _cursor() as conn:
        rows = conn.execute(
            """SELECT DISTINCT DATE(reviewed_at) AS d
               FROM review_log WHERE user_id=?
               ORDER BY d DESC""",
            (user_id,),
        ).fetchall()
    if not rows:
        return 0
    days = [datetime.strptime(r["d"], "%Y-%m-%d").date() for r in rows]
    today = date.today()
    streak = 0
    expected = today
    for d in days:
        if d == expected or (streak == 0 and d == today):
            if d == expected:
                streak += 1
                from datetime import timedelta
                expected = expected - timedelta(days=1)
            elif streak == 0 and d == today:
                streak = 1
                from datetime import timedelta
                expected = today - timedelta(days=1)
        else:
            break
    return streak


def get_hard_cards(user_id: int, set_name: str, limit: int = 10) -> list[dict]:
    """Top-N cards the user got wrong most often."""
    with _cursor() as conn:
        rows = conn.execute(
            """SELECT location, lapses, ease FROM card_reviews
               WHERE user_id=? AND set_name=?
               ORDER BY lapses DESC, ease ASC LIMIT ?""",
            (user_id, set_name, limit),
        ).fetchall()
    return [dict(r) for r in rows if r["lapses"] > 0]
