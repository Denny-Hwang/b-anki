"""Unit tests for theme 3 (PCUSA 헌법-규례 학습문제) logic."""
import csv
import os
import random

import pytest

from banki import quiz

DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "quiz_pcusa_constitution.csv",
)


def _q(**overrides) -> dict:
    base = {
        "id": "Q001",
        "category": "테스트",
        "question": "질문?",
        "answer": "노회",
        "accept": [],
        "distractors": ["당회", "대회", "총회"],
        "explanation": "",
    }
    base.update(overrides)
    return base


# ---------- CSV cell parsing ----------

def test_split_list_handles_blank_and_nan():
    assert quiz.split_list(None) == []
    assert quiz.split_list("") == []
    assert quiz.split_list("nan") == []
    assert quiz.split_list("  ") == []


def test_split_list_trims_parts():
    assert quiz.split_list("가 | 나|다 ") == ["가", "나", "다"]


def test_normalize_question_coerces_missing_cells():
    row = {"id": "Q9", "question": "무엇?", "answer": "노회"}
    q = quiz.normalize_question(row)
    assert q["category"] == "기타"
    assert q["accept"] == []
    assert q["distractors"] == []
    assert q["explanation"] == ""


def test_normalize_question_reads_pipe_columns():
    row = {
        "id": "Q9", "category": "공의회", "question": "무엇?", "answer": "노회",
        "accept": "노회|노회입니다", "distractors": "당회|대회",
        "explanation": "설명",
    }
    q = quiz.normalize_question(row)
    assert q["accept"] == ["노회", "노회입니다"]
    assert q["distractors"] == ["당회", "대회"]
    assert q["explanation"] == "설명"


# ---------- answer variants ----------

def test_answer_variants_splits_separators():
    variants = quiz.answer_variants("총회, 대회, 노회, 당회")
    assert "총회 대회 노회 당회" in variants


def test_answer_variants_drops_parens_and_enumeration():
    variants = quiz.answer_variants("① 하나(one) · 거룩(holy)")
    assert "하나 거룩" in variants


def test_answer_variants_keeps_original_first():
    assert quiz.answer_variants("노회")[0] == "노회"


# ---------- question selection ----------

def test_categories_preserve_csv_order():
    questions = [_q(id="a", category="나"), _q(id="b", category="가"), _q(id="c", category="나")]
    assert quiz.categories(questions) == ["나", "가"]


def test_select_questions_filters_by_category():
    questions = [_q(id="a", category="가"), _q(id="b", category="나")]
    picked = quiz.select_questions(questions, selected_categories=["나"])
    assert [q["id"] for q in picked] == ["b"]


def test_select_questions_applies_limit():
    questions = [_q(id=str(i)) for i in range(10)]
    assert len(quiz.select_questions(questions, limit=3)) == 3


def test_select_questions_limit_zero_means_all():
    questions = [_q(id=str(i)) for i in range(10)]
    assert len(quiz.select_questions(questions, limit=0)) == 10


def test_select_questions_shuffle_is_deterministic_with_seed():
    questions = [_q(id=str(i)) for i in range(20)]
    a = quiz.select_questions(questions, shuffle=True, rng=random.Random(1))
    b = quiz.select_questions(questions, shuffle=True, rng=random.Random(1))
    assert [q["id"] for q in a] == [q["id"] for q in b]


def test_select_questions_does_not_mutate_input():
    questions = [_q(id=str(i)) for i in range(10)]
    before = [q["id"] for q in questions]
    quiz.select_questions(questions, shuffle=True, rng=random.Random(2))
    assert [q["id"] for q in questions] == before


# ---------- multiple choice ----------

def test_build_choices_includes_answer_and_authored_distractors():
    q = _q()
    options = quiz.build_choices(q, [q], rng=random.Random(0))
    assert len(options) == quiz.CHOICE_COUNT
    assert q["answer"] in options
    assert set(options) - {q["answer"]} <= set(q["distractors"])


def test_build_choices_has_no_duplicates():
    q = _q(distractors=["당회", "당회", "대회", "총회"])
    options = quiz.build_choices(q, [q], rng=random.Random(0))
    assert len(options) == len(set(options))


def test_build_choices_borrows_answers_when_distractors_missing():
    target = _q(id="a", answer="정답입니다", distractors=[])
    pool = [target, _q(id="b", answer="다른답1"), _q(id="c", answer="다른답2"),
            _q(id="d", answer="다른답3")]
    options = quiz.build_choices(target, pool, rng=random.Random(0))
    assert target["answer"] in options
    assert len(options) == quiz.CHOICE_COUNT


def test_build_choices_never_repeats_the_answer_as_a_distractor():
    target = _q(id="a", answer="노회", distractors=[])
    pool = [target, _q(id="b", answer="노회"), _q(id="c", answer="당회")]
    options = quiz.build_choices(target, pool, rng=random.Random(0))
    assert options.count("노회") == 1


def test_build_choices_returns_empty_without_any_distractor():
    lonely = _q(id="a", distractors=[])
    assert quiz.build_choices(lonely, [lonely], rng=random.Random(0)) == []
    assert quiz.has_choice_form(lonely, [lonely]) is False


def test_has_choice_form_true_with_authored_distractors():
    q = _q()
    assert quiz.has_choice_form(q, [q]) is True


# ---------- short-answer grading ----------

def test_grade_exact_answer_is_correct():
    r = quiz.grade_short_answer("노회", _q())
    assert r["score"] == 100
    assert r["verdict"] == "correct"


def test_grade_accepts_alternate_answer():
    q = _q(answer="1/4 이상", accept=["1/4", "사분의 일"])
    assert quiz.grade_short_answer("사분의 일", q)["verdict"] == "correct"


def test_grade_ignores_answer_punctuation():
    q = _q(answer="총회, 대회, 노회, 당회", accept=[])
    assert quiz.grade_short_answer("총회 대회 노회 당회", q)["verdict"] == "correct"


def test_grade_blank_input_is_zero():
    r = quiz.grade_short_answer("   ", _q())
    assert r["score"] == 0
    assert r["verdict"] == "miss"
    assert r["detail"] is None


def test_grade_wrong_answer_is_miss():
    assert quiz.grade_short_answer("총회", _q())["verdict"] == "miss"


def test_grade_partial_answer_sits_between_thresholds():
    q = _q(answer="담임목사와 시무 장로 2인", accept=[])
    r = quiz.grade_short_answer("담임목사와 시무", q)
    assert r["verdict"] == "partial"
    assert quiz.PARTIAL_THRESHOLD <= r["score"] < quiz.CORRECT_THRESHOLD


def test_grade_question_without_answer_is_safe():
    r = quiz.grade_short_answer("아무거나", _q(answer="", accept=[]))
    assert r["verdict"] == "miss"
    assert r["best"] == ""


# ---------- summary ----------

def test_summarize_counts_each_verdict():
    results = {
        "a": {"verdict": "correct", "score": 100},
        "b": {"verdict": "partial", "score": 50},
        "c": {"verdict": "miss", "score": 0},
    }
    s = quiz.summarize(results)
    assert (s["total"], s["correct"], s["partial"], s["wrong"]) == (3, 1, 1, 1)
    assert s["avg_score"] == 50
    assert s["accuracy"] == 33


def test_summarize_empty_session():
    s = quiz.summarize({})
    assert s["total"] == 0
    assert s["accuracy"] == 0
    assert s["avg_score"] is None


# ---------- shipped question bank ----------

def _load_bank() -> list[dict]:
    with open(DATA_PATH, encoding="utf-8", newline="") as f:
        return [quiz.normalize_question(row) for row in csv.DictReader(f)]


def test_question_bank_is_wellformed():
    bank = _load_bank()
    assert len(bank) >= 30
    ids = [q["id"] for q in bank]
    assert len(ids) == len(set(ids)), "question ids must be unique"
    for q in bank:
        assert q["id"] and q["question"] and q["answer"], q
        assert q["answer"] not in q["distractors"], q["id"]


def test_every_bank_question_has_a_choice_form():
    bank = _load_bank()
    for q in bank:
        assert quiz.has_choice_form(q, bank), f"{q['id']} cannot be asked as 객관식"


def test_every_bank_answer_grades_itself_correct():
    bank = _load_bank()
    for q in bank:
        r = quiz.grade_short_answer(q["answer"], q)
        assert r["verdict"] == "correct", f"{q['id']} scored {r['score']} on its own answer"


def test_bank_choices_are_distinct_and_contain_the_answer():
    bank = _load_bank()
    for index, q in enumerate(bank):
        options = quiz.build_choices(q, bank, rng=random.Random(index))
        assert q["answer"] in options, q["id"]
        assert len(options) == len(set(options)), q["id"]
        assert len(options) == quiz.CHOICE_COUNT, q["id"]


def test_bank_categories_are_stable_and_nonempty():
    bank = _load_bank()
    cats = quiz.categories(bank)
    assert len(cats) >= 3
    for c in cats:
        assert any(q["category"] == c for q in bank)
