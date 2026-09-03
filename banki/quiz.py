"""Theme 3 core logic: question-bank parsing, option building, answer grading.

Pure functions only (no Streamlit) so they can be unit tested directly.
A question is a plain dict with these keys:

    id           unique question id (used as the SRS card key)
    category     grouping label, e.g. "당회와 공동의회"
    question     the prompt shown to the learner
    answer       the canonical answer
    accept       list of alternate answers also graded correct
    distractors  list of authored wrong options for multiple choice
    explanation  extra context shown after answering (may be empty)
"""
import random
import re

from . import grading

#: A short answer at/above this score counts as fully correct.
CORRECT_THRESHOLD = 70
#: At/above this score (but below CORRECT_THRESHOLD) counts as partially correct.
PARTIAL_THRESHOLD = 45

#: Options shown per multiple-choice question (correct answer included).
CHOICE_COUNT = 4

LIST_SEP = "|"

#: Punctuation that joins the parts of a list-style answer ("총회, 대회, 노회").
_SEPARATORS = re.compile(r"[·,/;+~]")
#: Parenthesised glosses, e.g. the "(one)" in "하나(one)".
_PARENS = re.compile(r"\([^)]*\)")
#: Circled enumeration markers used in multi-part answers.
_ENUM = re.compile(r"[①②③④⑤⑥⑦⑧⑨⑩]")


def answer_variants(text: str) -> list[str]:
    """Spelling variants of one answer that should all be graded the same.

    The dictation matcher compares whitespace-separated words, so a learner who
    types "총회 대회 노회 당회" must not be punished for the CSV writing
    "총회, 대회, 노회, 당회". Each variant progressively drops separators,
    enumeration markers, and parenthesised glosses.
    """
    out: list[str] = []

    def add(candidate: str) -> None:
        collapsed = " ".join(candidate.split())
        if collapsed and collapsed not in out:
            out.append(collapsed)

    add(text)
    no_sep = _SEPARATORS.sub(" ", text)
    add(no_sep)
    no_enum = _ENUM.sub(" ", no_sep)
    add(no_enum)
    add(_PARENS.sub(" ", no_enum))
    return out


def split_list(raw) -> list[str]:
    """Split a ``|``-separated CSV cell into a clean list of strings."""
    if raw is None:
        return []
    text = str(raw).strip()
    if not text or text.lower() == "nan":
        return []
    return [part.strip() for part in text.split(LIST_SEP) if part.strip()]


def normalize_question(row: dict) -> dict:
    """Coerce one raw CSV row into the question dict used across theme 3."""
    def cell(key: str) -> str:
        value = row.get(key)
        if value is None:
            return ""
        text = str(value).strip()
        return "" if text.lower() == "nan" else text

    return {
        "id": cell("id"),
        "category": cell("category") or "기타",
        "question": cell("question"),
        "answer": cell("answer"),
        "accept": split_list(row.get("accept")),
        "distractors": split_list(row.get("distractors")),
        "explanation": cell("explanation"),
    }


def categories(questions: list[dict]) -> list[str]:
    """Categories in first-seen order, so the CSV controls the ordering."""
    seen: list[str] = []
    for q in questions:
        if q["category"] not in seen:
            seen.append(q["category"])
    return seen


def select_questions(questions: list[dict], selected_categories: list[str] | None = None,
                     limit: int | None = None, shuffle: bool = False,
                     rng: random.Random | None = None) -> list[dict]:
    """Filter by category, optionally shuffle, then cut down to ``limit`` items."""
    rng = rng or random
    pool = list(questions)
    if selected_categories:
        wanted = set(selected_categories)
        pool = [q for q in pool if q["category"] in wanted]
    if shuffle:
        pool = list(pool)
        rng.shuffle(pool)
    if limit is not None and limit > 0:
        pool = pool[:limit]
    return pool


def _auto_distractors(question: dict, pool: list[dict], needed: int,
                      rng: random.Random) -> list[str]:
    """Borrow other questions' answers as options, closest in length first.

    Used for list-style questions that ship without authored distractors.
    """
    answer = question["answer"]
    target = max(len(answer), 1)
    candidates = [
        q["answer"] for q in pool
        if q["id"] != question["id"] and q["answer"] and q["answer"] != answer
    ]
    # de-duplicate while keeping order stable before the length sort
    unique: list[str] = []
    for c in candidates:
        if c not in unique:
            unique.append(c)
    same_category = {
        q["answer"] for q in pool
        if q["category"] == question["category"] and q["id"] != question["id"]
    }
    unique.sort(key=lambda c: (abs(len(c) - target) / target, c not in same_category))
    return unique[:needed]


def build_choices(question: dict, pool: list[dict], count: int = CHOICE_COUNT,
                  rng: random.Random | None = None) -> list[str]:
    """Return shuffled options for a multiple-choice question.

    Authored distractors are used first; if there aren't enough, other
    questions' answers fill in. Returns ``[]`` when fewer than two distinct
    options can be assembled, which means the question has no usable
    multiple-choice form.
    """
    rng = rng or random
    answer = question["answer"]
    if not answer:
        return []

    authored: list[str] = []
    for d in question["distractors"]:
        if d and d != answer and d not in authored:
            authored.append(d)
    rng.shuffle(authored)
    picked = authored[:count - 1]

    if len(picked) < count - 1:
        for extra in _auto_distractors(question, pool, count - 1 - len(picked), rng):
            if extra not in picked:
                picked.append(extra)

    if not picked:
        return []

    options = [answer] + picked
    rng.shuffle(options)
    return options


def has_choice_form(question: dict, pool: list[dict]) -> bool:
    """Whether the question can be asked as multiple choice at all."""
    if not question["answer"]:
        return False
    if question["distractors"]:
        return True
    return bool(_auto_distractors(question, pool, 1, random))


def grade_short_answer(user_text: str, question: dict) -> dict:
    """Grade a typed answer against the canonical answer and its alternates.

    Scores every accepted form with the verse-dictation matcher and keeps the
    best one, so partial credit works the same way it does in theme 1.
    """
    candidates: list[str] = []
    for accepted in [question["answer"], *question["accept"]]:
        for variant in answer_variants(accepted):
            if variant not in candidates:
                candidates.append(variant)
    if not candidates:
        return {"score": 0, "verdict": "miss", "best": "", "detail": None}

    best_result = None
    best_target = candidates[0]
    for target in candidates:
        result = grading.compute_word_match(user_text, target)
        if best_result is None or result["score"] > best_result["score"]:
            best_result = result
            best_target = target

    score = best_result["score"] if user_text.strip() else 0
    if score >= CORRECT_THRESHOLD:
        verdict = "correct"
    elif score >= PARTIAL_THRESHOLD:
        verdict = "partial"
    else:
        verdict = "miss"

    return {
        "score": score,
        "verdict": verdict,
        "best": best_target,
        "detail": best_result if user_text.strip() else None,
    }


def summarize(results: dict) -> dict:
    """Aggregate per-question results into a session summary.

    ``results`` maps question id -> {"verdict": ..., "score": ...}.
    """
    total = len(results)
    correct = sum(1 for r in results.values() if r.get("verdict") == "correct")
    partial = sum(1 for r in results.values() if r.get("verdict") == "partial")
    wrong = total - correct - partial
    scores = [r["score"] for r in results.values() if r.get("score") is not None]
    avg = round(sum(scores) / len(scores)) if scores else None
    accuracy = round(correct / total * 100) if total else 0
    return {
        "total": total,
        "correct": correct,
        "partial": partial,
        "wrong": wrong,
        "avg_score": avg,
        "accuracy": accuracy,
    }
