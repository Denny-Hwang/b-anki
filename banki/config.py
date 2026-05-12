"""Application-wide configuration constants."""
import os

BIBLE_VERSIONS = {
    "개역개정": "verse_krv",
    "NIV": "verse_niv",
}

DEFAULT_FILE = "kpccw 2026 성경암송.csv"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "banki.db")

DEFAULT_FONT_SIZE = 28
MIN_FONT_SIZE = 16
MAX_FONT_SIZE = 60
FONT_STEP = 4

GRADE_THRESHOLDS = [
    (95, "S"),
    (85, "A+"),
    (75, "A"),
    (65, "B"),
    (55, "C"),
    (0, "D"),
]

SCORE_CLASS_THRESHOLDS = [
    (80, "score-good"),
    (50, "score-ok"),
    (0, "score-bad"),
]


def classify_score(score: int) -> str:
    for threshold, cls in SCORE_CLASS_THRESHOLDS:
        if score >= threshold:
            return cls
    return "score-bad"


def compute_grade(score: int) -> str:
    for threshold, grade in GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "D"
