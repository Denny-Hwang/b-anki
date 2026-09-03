"""End-to-end smoke tests for theme 3 driven through Streamlit's AppTest.

These walk the real app the way a learner does — pick the theme, choose a
mode, answer questions, land on the result sheet — so a broken route or a
missing session-state key fails here instead of in the browser.
"""
import os
import tempfile

import pytest
from streamlit.testing.v1 import AppTest

from banki import config, storage

APP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app.py"
)


@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        monkeypatch.setattr(config, "DB_PATH", os.path.join(tmp, "test.db"))
        storage.init_db()
        yield


def _labels(at) -> list[str]:
    return [b.label for b in at.button]


def _click(at, needle: str):
    matches = [b for b in at.button if needle in b.label]
    assert matches, f"no button matching {needle!r} in {_labels(at)}"
    return matches[0].click().run()


def _open_quiz_setup():
    at = AppTest.from_file(APP_PATH, default_timeout=60)
    at.run()
    assert not at.exception
    return _click(at, "헌법·규례 문제풀기")


def _start(at, mode_keyword: str, count: int, shuffle: bool = False):
    at.radio[0].set_value(
        next(o for o in at.radio[0].options if mode_keyword in o)
    ).run()
    at.number_input[0].set_value(count).run()
    at.toggle[0].set_value(shuffle).run()
    return _click(at, "학습 시작")


def test_home_offers_all_three_themes():
    at = AppTest.from_file(APP_PATH, default_timeout=60)
    at.run()
    assert not at.exception
    labels = " ".join(_labels(at))
    assert "성경구절 암기" in labels
    assert "단어순서" in labels
    assert "헌법·규례" in labels


def test_setup_page_lists_the_bundled_question_bank():
    at = _open_quiz_setup()
    assert not at.exception
    assert at.selectbox[0].value == config.DEFAULT_QUIZ_FILE
    # every category in the CSV is offered and pre-selected
    assert len(at.multiselect[0].value) == len(at.multiselect[0].options)
    assert len(at.multiselect[0].options) >= 5


def test_setup_back_button_returns_home():
    at = _open_quiz_setup()
    at = _click(at, "돌아가기")
    assert not at.exception
    assert "성경구절 암기 시작" in " ".join(_labels(at))


def test_multiple_choice_round_reaches_result_sheet():
    at = _open_quiz_setup()
    at = _start(at, "객관식", 3)
    assert not at.exception

    for _ in range(3):
        options = [b for b in at.button if b.label[:1] in "①②③④"]
        assert len(options) == 4, _labels(at)
        at = options[0].click().run()
        assert not at.exception
        at = _click(at, "다음 문제")

    assert "새로 풀기" in " ".join(_labels(at))
    assert any("학습 결과표" in m.value for m in at.markdown)


def test_flashcard_self_rating_advances_and_records():
    at = _open_quiz_setup()
    at = _start(at, "플래시카드", 2)

    at = _click(at, "정답 확인")
    assert any("quiz-answer" in m.value for m in at.markdown)
    at = _click(at, "알았음")
    assert not at.exception

    at = _click(at, "정답 확인")
    at = _click(at, "몰랐음")
    assert not at.exception
    # the question rated 몰랐음 must show up in the wrong-answer notes
    assert any("오답노트" in m.value for m in at.markdown)


def test_short_answer_grades_a_correct_response():
    at = _open_quiz_setup()
    at = _start(at, "주관식", 1)

    answer = at.session_state["quiz_queue"][0]["answer"]
    at.text_area[0].set_value(answer).run()
    at = _click(at, "제출")
    assert not at.exception
    assert any("quiz-correct" in m.value for m in at.markdown)


def test_short_answer_marks_a_wrong_response():
    at = _open_quiz_setup()
    at = _start(at, "주관식", 1)

    at.text_area[0].set_value("전혀 관계 없는 답변입니다").run()
    at = _click(at, "제출")
    assert not at.exception
    assert any("quiz-wrong" in m.value for m in at.markdown)


def test_skipping_counts_as_wrong_but_leaves_srs_alone():
    at = _open_quiz_setup()
    at.text_input[0].set_value("스킵테스터").run()
    at = _start(at, "주관식", 1)

    question_id = at.session_state["quiz_queue"][0]["id"]
    at = _click(at, "건너뛰기")
    assert not at.exception
    assert any("오답노트" in m.value for m in at.markdown)

    user_id = storage.get_or_create_user("스킵테스터")
    state = storage.get_card_state(user_id, config.DEFAULT_QUIZ_FILE, question_id)
    assert state.is_new, "a skipped question must not be scheduled as reviewed"


def test_named_session_persists_progress_and_stats():
    at = _open_quiz_setup()
    at.text_input[0].set_value("헌법학습자").run()
    at = _start(at, "객관식", 2)

    for _ in range(2):
        options = [b for b in at.button if b.label[:1] in "①②③④"]
        at = options[0].click().run()
        at = _click(at, "다음 문제")

    assert not at.exception
    user_id = storage.get_or_create_user("헌법학습자")
    stats = storage.get_user_stats(user_id)
    assert stats["total_reviews"] == 2
    assert stats["sessions"], "the finished round should be logged as a session"
    assert stats["sessions"][0]["mode"] == "헌법문제-객관식"


def test_retry_wrong_requeues_only_the_missed_questions():
    at = _open_quiz_setup()
    at = _start(at, "주관식", 2)

    for _ in range(2):
        at.text_area[0].set_value("틀린 답").run()
        at = _click(at, "제출")
        at = _click(at, "다음 문제")

    at = _click(at, "오답만 다시 풀기")
    assert not at.exception
    assert len(at.session_state["quiz_queue"]) == 2
    assert at.session_state["quiz_index"] == 0
    assert at.session_state["quiz_results"] == {}
