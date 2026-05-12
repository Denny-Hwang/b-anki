"""Unit tests for grading."""
from banki.grading import compute_word_match, render_word_comparison_html


def test_exact_match():
    r = compute_word_match("사랑은 오래 참고", "사랑은 오래 참고")
    assert r["score"] == 100
    assert r["matched_words"] == 3
    assert r["partial_words"] == 0


def test_empty_answer():
    r = compute_word_match("anything", "")
    assert r["score"] == 100
    assert r["total_words"] == 0


def test_punctuation_tolerance():
    # NIV uses commas/periods; ignore them
    r = compute_word_match(
        "Love is patient love is kind",
        "Love is patient, love is kind.",
    )
    assert r["score"] == 100


def test_case_insensitive():
    r = compute_word_match("love is patient", "Love Is Patient")
    assert r["score"] == 100


def test_partial_match_via_fuzzy():
    # one-character typo -> high similarity, counts as partial
    r = compute_word_match("사라은 오래 참고", "사랑은 오래 참고")
    assert r["matched_words"] == 2
    assert r["partial_words"] == 1
    # 2 full + 0.6 partial = 2.6 / 3 = 86.67 -> 87
    assert r["score"] >= 80


def test_missing_words():
    r = compute_word_match("사랑은", "사랑은 오래 참고")
    assert r["matched_words"] == 1
    assert r["total_words"] == 3
    assert r["score"] < 50


def test_extra_words():
    r = compute_word_match("사랑은 오래 참고 더 많이", "사랑은 오래 참고")
    assert r["matched_words"] == 3
    extra_results = [w for w in r["word_results"] if w["match"] == "extra"]
    assert len(extra_results) == 2


def test_render_html_contains_classes():
    r = compute_word_match("사랑은 오래", "사랑은 오래")
    html = render_word_comparison_html(r)
    assert "w-full" in html
    assert "사랑은" in html
