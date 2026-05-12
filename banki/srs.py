"""SM-2 spaced repetition algorithm.

Based on the SuperMemo SM-2 algorithm with Anki-style 4-button rating:
    Again (1) - failed, reset interval
    Hard  (2) - barely remembered
    Good  (3) - remembered with effort
    Easy  (4) - trivial recall
"""
from dataclasses import dataclass
from datetime import date, timedelta

AGAIN = 1
HARD = 2
GOOD = 3
EASY = 4

RATING_LABELS = {
    AGAIN: "다시",
    HARD: "어려움",
    GOOD: "괜찮음",
    EASY: "쉬움",
}

RATING_COLORS = {
    AGAIN: "#ef4444",
    HARD: "#f59e0b",
    GOOD: "#22c55e",
    EASY: "#3b82f6",
}

DEFAULT_EASE = 2.5
MIN_EASE = 1.3
MAX_EASE = 3.0


@dataclass
class CardState:
    ease: float = DEFAULT_EASE
    interval_days: int = 0
    repetitions: int = 0
    last_reviewed: date | None = None
    due_date: date | None = None
    lapses: int = 0

    @property
    def is_new(self) -> bool:
        return self.repetitions == 0 and self.last_reviewed is None

    def is_due(self, today: date | None = None) -> bool:
        today = today or date.today()
        if self.due_date is None:
            return True
        return self.due_date <= today


def review(state: CardState, rating: int, today: date | None = None) -> CardState:
    """Apply a rating to a card and return its new state."""
    today = today or date.today()
    new = CardState(
        ease=state.ease,
        interval_days=state.interval_days,
        repetitions=state.repetitions,
        last_reviewed=today,
        due_date=state.due_date,
        lapses=state.lapses,
    )

    if rating == AGAIN:
        new.repetitions = 0
        new.interval_days = 1
        new.lapses = state.lapses + 1
        new.ease = max(MIN_EASE, state.ease - 0.20)
    else:
        new.repetitions = state.repetitions + 1
        if new.repetitions == 1:
            new.interval_days = 1
        elif new.repetitions == 2:
            new.interval_days = 6
        else:
            multiplier = state.ease
            if rating == HARD:
                multiplier = max(MIN_EASE, state.ease * 0.8)
            elif rating == EASY:
                multiplier = state.ease * 1.3
            new.interval_days = max(1, round(state.interval_days * multiplier))

        if rating == HARD:
            new.ease = max(MIN_EASE, state.ease - 0.15)
        elif rating == GOOD:
            new.ease = state.ease
        elif rating == EASY:
            new.ease = min(MAX_EASE, state.ease + 0.15)

    new.due_date = today + timedelta(days=new.interval_days)
    return new


def rating_from_score(score: int) -> int:
    """Suggest a rating from a dictation score percentage."""
    if score >= 95:
        return EASY
    if score >= 80:
        return GOOD
    if score >= 50:
        return HARD
    return AGAIN


def sort_for_session(card_states: dict[int, CardState], all_indices: list[int], today: date | None = None) -> list[int]:
    """Return a learning order: due cards first (by overdue-ness), then new cards."""
    today = today or date.today()
    due = []
    new = []
    future = []
    for idx in all_indices:
        s = card_states.get(idx)
        if s is None or s.is_new:
            new.append(idx)
        elif s.is_due(today):
            overdue = (today - (s.due_date or today)).days
            due.append((-overdue, idx))
        else:
            future.append(idx)
    due.sort()
    return [i for _, i in due] + new + future
