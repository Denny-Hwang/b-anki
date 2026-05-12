"""Unit tests for SM-2 SRS algorithm."""
from datetime import date, timedelta

from banki.srs import (
    AGAIN, HARD, GOOD, EASY,
    CardState, review, rating_from_score, sort_for_session, DEFAULT_EASE,
)


def test_new_card_first_good_review_one_day():
    s = CardState()
    today = date(2025, 1, 1)
    new = review(s, GOOD, today)
    assert new.repetitions == 1
    assert new.interval_days == 1
    assert new.due_date == today + timedelta(days=1)


def test_second_good_review_six_days():
    s = CardState(repetitions=1, interval_days=1, ease=DEFAULT_EASE)
    today = date(2025, 1, 2)
    new = review(s, GOOD, today)
    assert new.repetitions == 2
    assert new.interval_days == 6


def test_third_good_uses_ease():
    s = CardState(repetitions=2, interval_days=6, ease=2.5)
    new = review(s, GOOD, date(2025, 1, 10))
    assert new.repetitions == 3
    assert new.interval_days == round(6 * 2.5)  # 15


def test_again_resets_and_lowers_ease():
    s = CardState(repetitions=5, interval_days=30, ease=2.5)
    new = review(s, AGAIN, date(2025, 1, 1))
    assert new.repetitions == 0
    assert new.interval_days == 1
    assert new.lapses == 1
    assert new.ease < 2.5


def test_easy_raises_ease():
    s = CardState(repetitions=2, interval_days=6, ease=2.5)
    new = review(s, EASY, date(2025, 1, 1))
    assert new.ease > 2.5
    assert new.interval_days > 6


def test_ease_floor():
    s = CardState(repetitions=5, interval_days=30, ease=1.35)
    new = review(s, AGAIN)
    assert new.ease >= 1.3


def test_due_logic():
    s = CardState(repetitions=1, due_date=date(2025, 1, 5))
    assert s.is_due(date(2025, 1, 5))
    assert s.is_due(date(2025, 1, 10))
    assert not s.is_due(date(2025, 1, 1))


def test_sort_for_session_orders_due_first():
    today = date(2025, 1, 15)
    states = {
        0: CardState(repetitions=1, due_date=date(2025, 1, 10)),  # overdue 5
        1: CardState(),  # new
        2: CardState(repetitions=1, due_date=date(2025, 1, 20)),  # future
        3: CardState(repetitions=1, due_date=date(2025, 1, 14)),  # overdue 1
    }
    order = sort_for_session(states, [0, 1, 2, 3], today)
    # most overdue first
    assert order[0] == 0
    assert order[1] == 3
    # new cards next
    assert 1 in order[2:]
    # future last
    assert order[-1] == 2


def test_rating_from_score():
    assert rating_from_score(100) == EASY
    assert rating_from_score(85) == GOOD
    assert rating_from_score(60) == HARD
    assert rating_from_score(20) == AGAIN
