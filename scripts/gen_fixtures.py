"""Generate golden fixtures from the Python reference implementation.

The GitHub Pages front-end re-implements grading, SM-2 scheduling, hints and
the theme-3 question logic in JavaScript. These fixtures pin the Python
outputs so `node web/tests/logic.test.mjs` can prove the two agree.

    python3 scripts/gen_fixtures.py && node web/tests/logic.test.mjs
"""
import csv
import itertools
import json
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from banki import bible_data, grading, hints, quiz, srs  # noqa: E402

OUT = os.path.join(ROOT, "tests", "fixtures", "logic.json")
TODAY = "2026-09-03"


def read_csv(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def state_to_dict(state):
    def iso(value):
        return value.isoformat() if hasattr(value, "isoformat") else value

    return {
        "ease": state.ease,
        "interval_days": state.interval_days,
        "repetitions": state.repetitions,
        "last_reviewed": iso(state.last_reviewed),
        "due_date": iso(state.due_date),
        "lapses": state.lapses,
    }


#: One letter per answer word, so full per-word coverage stays compact.
MARKS = {"full": "f", "partial": "p", "miss": "m", "missing": "x", "extra": "e"}


def digest(result):
    """Everything compute_word_match decided, in a form that stays small."""
    return {
        "score": result["score"],
        "total_words": result["total_words"],
        "matched_words": result["matched_words"],
        "partial_words": result["partial_words"],
        "marks": "".join(MARKS[w["match"]] for w in result["word_results"]),
    }


def grading_cases():
    verses = [r["verse_krv"] for r in read_csv("kpccw 2026 성경암송.csv")]
    cases = []

    def add(user, answer):
        cases.append({
            "user": user,
            "answer": answer,
            "expected": digest(grading.compute_word_match(user, answer)),
        })

    for verse in verses:
        words = verse.split()
        add(verse, verse)                                  # perfect recall
        add(" ".join(words[: len(words) // 2]), verse)     # stopped halfway
        add(verse.replace(" ", ""), verse)                 # no spaces at all
        add(verse + " 아멘", verse)                         # extra word
        add("", verse)                                     # blank
        if len(words) > 2:
            typo = list(words)
            typo[1] = typo[1][:-1] + "가"                   # single-char typo
            add(" ".join(typo), verse)
            add(" ".join(reversed(words)), verse)          # scrambled

    # punctuation and case tolerance
    add("Therefore, if anyone is in Christ", "Therefore if anyone is in Christ")
    add("주의 말씀은, 내 발의 등이요!", "주의 말씀은 내 발의 등이요")
    add("전혀 관계 없는 문장입니다", verses[0])
    add("", "")
    return cases


def grading_detail_cases():
    """A handful of cases kept in full, including per-word similarity floats."""
    verses = [r["verse_krv"] for r in read_csv("kpccw 2026 성경암송.csv")]
    pairs = [
        (verses[0], verses[0]),
        (" ".join(verses[0].split()[:3]), verses[0]),
        (verses[1] + " 아멘", verses[1]),
        ("주의 말씀은, 내 발의 등이요!", "주의 말씀은 내 발의 등이요"),
        ("내게 능력 주시난 자", "내게 능력 주시는 자"),
        ("", verses[2]),
        ("", ""),
    ]
    return [
        {"user": u, "answer": a, "expected": grading.compute_word_match(u, a)}
        for u, a in pairs
    ]


def srs_cases():
    ratings = [srs.AGAIN, srs.HARD, srs.GOOD, srs.EASY]
    sequences = []
    for length in (1, 2, 3, 4):
        for seq in itertools.product(ratings, repeat=length):
            state = srs.CardState()
            for rating in seq:
                state = srs.review(state, rating, date.fromisoformat(TODAY))
            sequences.append({"ratings": list(seq), "expected": state_to_dict(state)})
    return {
        "today": TODAY,
        "sequences": sequences,
        "rating_from_score": [
            {"score": s, "expected": srs.rating_from_score(s)} for s in range(0, 101)
        ],
        "sort_for_session": sort_cases(),
    }


def sort_cases():
    today = date.fromisoformat(TODAY)

    def make(due_offset, reps=3):
        state = srs.CardState(ease=2.5, interval_days=5, repetitions=reps,
                              last_reviewed=today, due_date=today.fromordinal(
                                  today.toordinal() + due_offset))
        return state

    scenarios = [
        {"states": {0: make(-5), 1: make(3), 2: None, 3: make(0), 4: make(-1)},
         "indices": [0, 1, 2, 3, 4]},
        {"states": {0: None, 1: None, 2: make(-10)}, "indices": [0, 1, 2]},
        {"states": {}, "indices": [0, 1, 2, 3]},
    ]
    out = []
    for sc in scenarios:
        states = {k: (v if v is not None else srs.CardState()) for k, v in sc["states"].items()}
        expected = srs.sort_for_session(states, sc["indices"], today)
        out.append({
            "states": {str(k): state_to_dict(v) for k, v in states.items()},
            "indices": sc["indices"],
            "expected": expected,
        })
    return out


def hints_cases():
    verses = [r["verse_krv"] for r in read_csv("kpccw 2026 성경암송.csv")]
    verse_cases = [
        {"verse": v, "level": lvl, "expected": hints.verse_hint(v, lvl)}
        for v in verses for lvl in (-1, 0, 1, 2, 3, 4, 5)
    ]
    books = list(bible_data.BIBLE_BOOK_EMOJIS.keys())
    book_cases = [
        {"word": w, "level": lvl,
         "expected": hints.book_hint(w, lvl, bible_data.BIBLE_BOOK_EMOJIS,
                                     bible_data.BIBLE_BOOK_HINTS)}
        for w in books for lvl in (1, 2, 3)
    ]
    chosung_cases = [{"text": w, "expected": hints.get_chosung(w)} for w in books]
    chosung_cases.append({"text": "Genesis 1:1", "expected": hints.get_chosung("Genesis 1:1")})
    return {"verse": verse_cases, "book": book_cases, "chosung": chosung_cases}


def quiz_cases():
    rows = read_csv("quiz_pcusa_constitution.csv")
    questions = [quiz.normalize_question(r) for r in rows]

    grade = []
    for q in questions:
        attempts = [q["answer"], *q["accept"], "", "전혀 관계 없는 답변입니다"]
        first_word = q["answer"].split()[0] if q["answer"].split() else q["answer"]
        attempts.append(first_word)
        for attempt in attempts:
            result = quiz.grade_short_answer(attempt, q)
            grade.append({
                "id": q["id"], "attempt": attempt,
                "expected": {"score": result["score"], "verdict": result["verdict"],
                             "best": result["best"]},
            })

    choices = [
        {"id": q["id"],
         "expected_set": sorted(quiz.build_choices(q, questions)),
         "has_choice_form": quiz.has_choice_form(q, questions)}
        for q in questions
    ]

    summaries = []
    for cut in (1, 5, 12, 34):
        results = {}
        for i, q in enumerate(questions[:cut]):
            verdict = ["correct", "partial", "miss"][i % 3]
            results[q["id"]] = {"verdict": verdict, "score": (i * 7) % 101}
        summaries.append({"results": results, "expected": quiz.summarize(results)})

    return {
        "normalized": questions,
        "categories": quiz.categories(questions),
        "variants": [{"text": q["answer"], "expected": quiz.answer_variants(q["answer"])}
                     for q in questions],
        "split_list": [
            {"raw": raw, "expected": quiz.split_list(raw)}
            for raw in ["a|b|c", " a | b ", "", "nan", "NaN", "|", "a||b", None, "단일"]
        ],
        "grade": grade,
        "choices": choices,
        "summaries": summaries,
    }


def main():
    payload = {
        "_generated_by": "scripts/gen_fixtures.py",
        "grading": grading_cases(),
        "grading_detail": grading_detail_cases(),
        "srs": srs_cases(),
        "hints": hints_cases(),
        "quiz": quiz_cases(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, sort_keys=True,
                  separators=(",", ":"))
    counts = {
        "grading": len(payload["grading"]),
        "srs.sequences": len(payload["srs"]["sequences"]),
        "hints.verse": len(payload["hints"]["verse"]),
        "hints.book": len(payload["hints"]["book"]),
        "quiz.grade": len(payload["quiz"]["grade"]),
        "quiz.choices": len(payload["quiz"]["choices"]),
    }
    print(f"wrote {OUT}")
    for k, v in counts.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
