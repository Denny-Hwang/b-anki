"""Unit tests for hints."""
from banki.hints import (
    first_chosung, get_chosung, verse_hint, book_hint, chosung_outline,
)


def test_chosung_basic():
    assert first_chosung("사랑") == "ㅅ"
    assert first_chosung("하나님") == "ㅎ"
    assert first_chosung("Love") == "L"


def test_chosung_outline():
    assert get_chosung("사랑은") == "ㅅㄹㅇ"


def test_verse_hint_levels():
    verse = "사랑은 오래 참고 사랑은 온유하며"
    h0 = verse_hint(verse, 0)
    assert "ㅅ" in h0
    h1 = verse_hint(verse, 1)
    assert "사랑은" in h1
    h2 = verse_hint(verse, 2)
    assert "사랑은" in h2 and "ㅇ" in h2
    h3 = verse_hint(verse, 3)
    assert "사랑은" in h3 and "오래" in h3
    h4 = verse_hint(verse, 4)
    # half of 5 words = 2 words
    assert "사랑은" in h4 and "오래" in h4


def test_verse_hint_empty():
    assert verse_hint("", 0) == ""


def test_book_hint_progressive():
    emojis = {"창세기": "🌍"}
    hints = {"창세기": "천지창조"}
    l1 = book_hint("창세기", 1, emojis, hints)
    assert "천지창조" in l1 and "🌍" in l1
    l3 = book_hint("창세기", 3, emojis, hints)
    assert "ㅊ" in l3 and "3글자" in l3


def test_book_hint_unknown_word():
    h = book_hint("새책", 1, {}, {})
    assert "ㅅ" in h
