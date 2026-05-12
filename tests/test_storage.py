"""Unit tests for SQLite storage."""
import os
import tempfile
from datetime import date

import pytest

from banki import config, storage
from banki.srs import AGAIN, GOOD, CardState


@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    """Run each test against a fresh temporary database."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "test.db")
        monkeypatch.setattr(config, "DB_PATH", db_path)
        storage.init_db()
        yield db_path


def test_create_user_idempotent():
    a = storage.get_or_create_user("Alice")
    b = storage.get_or_create_user("Alice")
    assert a == b


def test_save_and_load_card_state():
    uid = storage.get_or_create_user("Bob")
    cs = CardState(ease=2.4, interval_days=6, repetitions=2,
                   last_reviewed=date(2025, 1, 1), due_date=date(2025, 1, 7))
    storage.save_card_state(uid, "set.csv", "롬 8:28", cs)

    got = storage.get_card_state(uid, "set.csv", "롬 8:28")
    assert got.ease == 2.4
    assert got.interval_days == 6
    assert got.repetitions == 2


def test_load_card_states_bulk():
    uid = storage.get_or_create_user("Carol")
    storage.save_card_state(uid, "set.csv", "a", CardState(ease=2.0))
    storage.save_card_state(uid, "set.csv", "b", CardState(ease=2.8))

    bulk = storage.load_card_states(uid, "set.csv", ["a", "b", "c"])
    assert len(bulk) == 2
    assert bulk["a"].ease == 2.0
    assert bulk["b"].ease == 2.8
    assert "c" not in bulk


def test_review_log_and_stats():
    uid = storage.get_or_create_user("Dave")
    storage.log_review(uid, "set.csv", "a", GOOD, 92)
    storage.log_review(uid, "set.csv", "b", AGAIN, 40)

    stats = storage.get_user_stats(uid)
    assert stats["total_reviews"] == 2
    assert stats["avg_accuracy"] == 66  # (92+40)/2


def test_due_count():
    uid = storage.get_or_create_user("Eve")
    storage.save_card_state(uid, "set.csv", "x", CardState(
        repetitions=1, interval_days=1, due_date=date(2020, 1, 1),
    ))
    storage.save_card_state(uid, "set.csv", "y", CardState(
        repetitions=1, interval_days=1, due_date=date(2999, 1, 1),
    ))
    assert storage.get_due_count(uid, "set.csv", date.today()) == 1


def test_streak_today():
    uid = storage.get_or_create_user("Frank")
    storage.log_review(uid, "set.csv", "a", GOOD, 90)
    s = storage.compute_streak(uid)
    assert s == 1


def test_hard_cards():
    uid = storage.get_or_create_user("Grace")
    storage.save_card_state(uid, "set.csv", "easy", CardState(ease=2.5, lapses=0))
    storage.save_card_state(uid, "set.csv", "hard1", CardState(ease=1.8, lapses=3))
    storage.save_card_state(uid, "set.csv", "hard2", CardState(ease=2.0, lapses=2))
    cards = storage.get_hard_cards(uid, "set.csv")
    locations = [c["location"] for c in cards]
    assert "hard1" in locations
    assert "hard2" in locations
    assert "easy" not in locations
