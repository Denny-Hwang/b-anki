"""Theme 3: PCUSA 헌법·규례서 학습문제 (flashcard / multiple choice / short answer)."""
import html
import os
import random
import time

import streamlit as st

from . import audio, certificate, config, data_loader, grading, quiz, srs, stats, storage

FLASHCARD = "플래시카드"
CHOICE = "객관식"
SHORT = "주관식"

MODE_OPTIONS = {
    f"📖 {FLASHCARD} - 답을 가리고 스스로 확인": FLASHCARD,
    f"🔤 {CHOICE} - 4개 보기 중에서 선택": CHOICE,
    f"✍️ {SHORT} - 답을 직접 입력": SHORT,
}

VERDICT_STYLE = {
    "correct": ("✅ 정답", "quiz-correct"),
    "partial": ("🟡 부분 정답", "quiz-partial"),
    "miss": ("❌ 오답", "quiz-wrong"),
}


def _ss(key, default=None):
    return st.session_state.get(key, default)


def _reset_state() -> None:
    for k in [k for k in st.session_state.keys() if k.startswith("quiz_")]:
        del st.session_state[k]


def _esc(text: str) -> str:
    return html.escape(text or "")


# ---------- setup ----------

def render_setup() -> None:
    st.markdown("### ⚖️ PCUSA 헌법·규례 학습문제")
    st.caption("미국장로교(PCUSA) 헌법과 규례서, 직제사역에 관한 문제를 풀며 익힙니다.")
    st.markdown("---")

    files = data_loader.list_quiz_files()
    if not files:
        st.warning(
            f"data/ 폴더에 문제집 CSV가 없습니다. "
            f"`{config.QUIZ_FILE_PREFIX}*.csv` 형식의 파일을 추가해 주세요."
        )
        if st.button("🏠 돌아가기", use_container_width=True):
            st.session_state.selected_theme = None
            st.rerun()
        return

    selected_file = st.selectbox("문제집", files, index=0)
    questions = data_loader.load_quiz_csv(os.path.join(config.DATA_DIR, selected_file))
    if not questions:
        st.error("문제집 CSV에 id, category, question, answer 컬럼이 필요합니다.")
        return

    all_categories = quiz.categories(questions)
    counts = {c: sum(1 for q in questions if q["category"] == c) for c in all_categories}

    default_name = st.session_state.get("last_user_name") or st.query_params.get("user", "")
    user_name = st.text_input(
        "이름 (선택사항, 통계 추적용)", value=default_name, placeholder="이름을 입력하세요"
    )

    st.markdown("**출제 분야**")
    picked_categories = st.multiselect(
        "분야",
        all_categories,
        default=all_categories,
        format_func=lambda c: f"{c} ({counts[c]}문제)",
        label_visibility="collapsed",
    )
    if not picked_categories:
        picked_categories = all_categories

    available = sum(counts[c] for c in picked_categories)
    st.caption(f"선택한 분야의 문제 수: **{available}문제**")

    st.markdown("**학습 방식**")
    mode_label = st.radio("방식", list(MODE_OPTIONS.keys()), label_visibility="collapsed")
    mode = MODE_OPTIONS[mode_label]

    col_a, col_b = st.columns(2)
    with col_a:
        limit = st.number_input(
            "출제 문항 수 (0 = 전체)",
            min_value=0, max_value=max(available, 1),
            value=min(20, available) if available else 0,
            help="0을 입력하면 선택한 분야의 모든 문제를 출제합니다",
        )
    with col_b:
        shuffle = st.toggle("랜덤 순서", value=True)

    use_srs = st.toggle(
        "간격 반복 학습 (SRS)",
        value=True,
        help="이름을 입력하면 틀린 문제를 더 자주, 아는 문제는 드물게 출제합니다",
    )

    if user_name.strip():
        storage.init_db()
        user_id = storage.get_or_create_user(user_name.strip())
        due = storage.get_due_count(user_id, selected_file)
        if due:
            st.info(f"📅 오늘 복습할 문제: **{due}개**")

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🚀 학습 시작", type="primary", use_container_width=True):
            _start(questions, selected_file, picked_categories, mode,
                   int(limit), shuffle, use_srs, user_name.strip())
            st.rerun()
    with col2:
        if st.button("🏠 돌아가기", use_container_width=True):
            st.session_state.selected_theme = None
            st.rerun()

    with st.expander("📚 문제집 미리보기"):
        for category in picked_categories:
            in_cat = [q for q in questions if q["category"] == category]
            st.markdown(f"**{category}** ({len(in_cat)}문제)")
            for q in in_cat[:3]:
                st.caption(f"· {q['question']}")
            if len(in_cat) > 3:
                st.caption(f"… 외 {len(in_cat) - 3}문제")


def _start(questions: list[dict], set_name: str, picked_categories: list[str],
           mode: str, limit: int, shuffle: bool, use_srs: bool, username: str) -> None:
    user_id = None
    session_id = None
    if username:
        storage.init_db()
        user_id = storage.get_or_create_user(username)
        session_id = storage.start_session(user_id, set_name, f"헌법문제-{mode}")
        st.session_state.last_user_name = username
        st.query_params["user"] = username

    pool = quiz.select_questions(questions, picked_categories, limit=None, shuffle=shuffle)
    if mode == CHOICE:
        pool = [q for q in pool if quiz.has_choice_form(q, questions)]
    if use_srs and user_id:
        pool = _sort_by_srs(pool, user_id, set_name)
    if limit > 0:
        pool = pool[:limit]

    st.session_state.quiz_started = True
    st.session_state.quiz_bank = questions
    st.session_state.quiz_queue = pool
    st.session_state.quiz_set_name = set_name
    st.session_state.quiz_mode = mode
    st.session_state.quiz_index = 0
    st.session_state.quiz_results = {}
    st.session_state.quiz_revealed = False
    st.session_state.quiz_submitted = False
    st.session_state.quiz_username = username
    st.session_state.quiz_user_id = user_id
    st.session_state.quiz_session_id = session_id
    st.session_state.quiz_use_srs = use_srs and user_id is not None
    st.session_state.quiz_started_at = time.time()
    st.session_state.quiz_input_key = 0
    st.session_state.quiz_choice_cache = {}
    st.session_state.quiz_session_ended = False
    st.session_state.quiz_review_round = 0


def _sort_by_srs(pool: list[dict], user_id: int, set_name: str) -> list[dict]:
    """Order questions with the same SM-2 scheduling theme 1 uses."""
    states = storage.load_card_states(user_id, set_name, [q["id"] for q in pool])
    by_index = {i: states.get(q["id"], srs.CardState()) for i, q in enumerate(pool)}
    order = srs.sort_for_session(by_index, list(range(len(pool))))
    return [pool[i] for i in order]


# ---------- main loop ----------

def render_game() -> None:
    queue = _ss("quiz_queue") or []
    if not queue:
        st.warning("선택한 조건에 해당하는 문제가 없습니다.")
        if st.button("🔙 설정으로 돌아가기", use_container_width=True):
            st.session_state.quiz_started = False
            st.rerun()
        return

    index = st.session_state.quiz_index
    if index >= len(queue):
        _render_result()
        return

    _render_header(index, len(queue))
    question = queue[index]
    mode = st.session_state.quiz_mode

    st.markdown("---")
    st.markdown(
        f'<div class="quiz-category">📂 {_esc(question["category"])}</div>'
        f'<div class="quiz-question" role="region" aria-label="문제">'
        f'<span class="quiz-num">Q{index + 1}.</span> {_esc(question["question"])}</div>',
        unsafe_allow_html=True,
    )

    if mode == FLASHCARD:
        _render_flashcard(question)
    elif mode == CHOICE:
        _render_choice(question, index)
    else:
        _render_short(question, index)


def _render_header(index: int, total: int) -> None:
    hcol1, hcol2 = st.columns([3, 1])
    with hcol1:
        st.markdown("### ⚖️ PCUSA 헌법·규례 학습문제")
        st.caption(f"📖 {st.session_state.quiz_set_name} | {st.session_state.quiz_mode}")
    with hcol2:
        if st.button("🏠 홈", use_container_width=True, key="quiz_home_btn"):
            _reset_state()
            st.session_state.selected_theme = None
            st.rerun()

    summary = quiz.summarize(st.session_state.quiz_results)
    st.progress(index / total if total else 0)
    scored = summary["correct"] + summary["partial"]
    st.caption(
        f"진행: {index} / {total}  |  정답 {summary['correct']}"
        + (f" · 부분정답 {summary['partial']}" if summary["partial"] else "")
        + f" · 오답 {summary['wrong']}"
        + (f"  |  정답률 {round(scored / index * 100)}%" if index else "")
    )


# ---------- mode renderers ----------

def _render_flashcard(question: dict) -> None:
    if not st.session_state.quiz_revealed:
        st.markdown(
            '<div class="quiz-hidden" role="status">🤔 답을 떠올려 보세요</div>',
            unsafe_allow_html=True,
        )
        col1, col2 = st.columns([2, 1])
        with col1:
            if st.button("👀 정답 확인", type="primary", use_container_width=True):
                st.session_state.quiz_revealed = True
                st.rerun()
        with col2:
            if st.button("⏭️ 건너뛰기", use_container_width=True, key="fc_skip"):
                _advance(question, verdict="miss", score=None, rating=srs.AGAIN, log_srs=False)
                st.rerun()
        return

    _render_answer_block(question)
    st.caption("스스로 평가하면 다음 복습 일정이 조정됩니다")
    labels = [
        (srs.AGAIN, "🔁 몰랐음", "miss"),
        (srs.HARD, "😅 애매함", "partial"),
        (srs.GOOD, "🙂 알았음", "correct"),
        (srs.EASY, "🎉 확실함", "correct"),
    ]
    cols = st.columns(4)
    for col, (rating, label, verdict) in zip(cols, labels):
        with col:
            if st.button(label, use_container_width=True, key=f"fc_{rating}_{question['id']}"):
                _advance(question, verdict=verdict, score=None, rating=rating)
                st.rerun()


def _render_choice(question: dict, index: int) -> None:
    cache = st.session_state.quiz_choice_cache
    cache_key = f"{question['id']}#{st.session_state.quiz_review_round}"
    if cache_key not in cache:
        rng = random.Random(f"{question['id']}-{st.session_state.quiz_started_at}-{index}")
        cache[cache_key] = quiz.build_choices(question, st.session_state.quiz_bank, rng=rng)
    options = cache[cache_key]

    if not options:
        st.info("이 문제는 객관식으로 출제할 수 없어 건너뜁니다.")
        _advance(question, verdict="miss", score=None, rating=srs.AGAIN,
                 record=False, log_srs=False)
        st.rerun()
        return

    if not st.session_state.quiz_submitted:
        for i, option in enumerate(options):
            if st.button(f"{'①②③④⑤'[i] if i < 5 else i + 1} {option}",
                         use_container_width=True,
                         key=f"opt_{question['id']}_{index}_{i}"):
                st.session_state.quiz_picked = option
                st.session_state.quiz_submitted = True
                correct = option == question["answer"]
                audio.play_sound("success" if correct else "fail")
                st.rerun()
        return

    picked = _ss("quiz_picked", "")
    correct = picked == question["answer"]
    verdict = "correct" if correct else "miss"
    _render_verdict(verdict)
    if not correct:
        st.markdown(
            f'<div class="quiz-picked">내가 고른 답: {_esc(picked)}</div>',
            unsafe_allow_html=True,
        )
    _render_answer_block(question)
    if st.button("➡️ 다음 문제", type="primary", use_container_width=True,
                 key=f"next_{question['id']}_{index}"):
        _advance(question, verdict=verdict, score=100 if correct else 0,
                 rating=srs.GOOD if correct else srs.AGAIN)
        st.rerun()


def _render_short(question: dict, index: int) -> None:
    if not st.session_state.quiz_submitted:
        input_key = f"quiz_short_{st.session_state.quiz_input_key}"
        user_text = st.text_area(
            "답을 입력하세요",
            key=input_key,
            height=100,
            placeholder="답을 입력하세요...",
            label_visibility="collapsed",
        )
        col1, col2 = st.columns([2, 1])
        with col1:
            if st.button("제출", type="primary", use_container_width=True):
                st.session_state.quiz_typed = user_text
                st.session_state.quiz_submitted = True
                st.rerun()
        with col2:
            if st.button("⏭️ 건너뛰기", use_container_width=True, key="short_skip"):
                _advance(question, verdict="miss", score=None, rating=srs.AGAIN, log_srs=False)
                st.rerun()
        return

    result = quiz.grade_short_answer(_ss("quiz_typed", ""), question)
    if result["verdict"] == "correct":
        audio.play_sound("success")
    elif result["verdict"] == "miss":
        audio.play_sound("fail")

    score_class = config.classify_score(result["score"])
    st.markdown(
        f'<div class="{score_class} score-display" aria-live="polite">{result["score"]}%</div>',
        unsafe_allow_html=True,
    )
    _render_verdict(result["verdict"])
    if result["detail"]:
        st.markdown(
            '<div class="dictation-result">'
            + grading.render_word_comparison_html(result["detail"])
            + "</div>",
            unsafe_allow_html=True,
        )
    _render_answer_block(question)

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 다시 입력", use_container_width=True, key=f"retry_{question['id']}"):
            st.session_state.quiz_submitted = False
            st.session_state.quiz_typed = ""
            st.session_state.quiz_input_key += 1
            st.rerun()
    with col2:
        if st.button("➡️ 다음 문제", type="primary", use_container_width=True,
                     key=f"next_short_{question['id']}_{index}"):
            _advance(question, verdict=result["verdict"], score=result["score"],
                     rating=srs.rating_from_score(result["score"]))
            st.rerun()


def _render_verdict(verdict: str) -> None:
    label, css = VERDICT_STYLE[verdict]
    st.markdown(f'<div class="quiz-verdict {css}">{label}</div>', unsafe_allow_html=True)


def _render_answer_block(question: dict) -> None:
    st.markdown(
        f'<div class="quiz-answer"><span class="quiz-answer-lbl">정답</span>'
        f'{_esc(question["answer"])}</div>',
        unsafe_allow_html=True,
    )
    if question["accept"]:
        st.caption("이렇게 답해도 정답: " + " / ".join(question["accept"]))
    if question["explanation"]:
        st.markdown(
            f'<div class="quiz-explanation">📌 {_esc(question["explanation"])}</div>',
            unsafe_allow_html=True,
        )


# ---------- progression ----------

def _advance(question: dict, verdict: str, score: int | None, rating: int,
             record: bool = True, log_srs: bool = True) -> None:
    """Store the outcome and move to the next question.

    ``record`` keeps the question out of the session summary entirely (used
    when a question can't be asked in the chosen mode); ``log_srs`` keeps it in
    the summary but out of the review schedule (used for skips, which are no
    evidence either way).
    """
    if record:
        st.session_state.quiz_results[question["id"]] = {
            "verdict": verdict,
            "score": score,
            "question": question["question"],
            "answer": question["answer"],
            "category": question["category"],
        }
        user_id = _ss("quiz_user_id")
        if user_id and log_srs:
            set_name = st.session_state.quiz_set_name
            prev = storage.get_card_state(user_id, set_name, question["id"])
            storage.save_card_state(user_id, set_name, question["id"], srs.review(prev, rating))
            storage.log_review(user_id, set_name, question["id"], rating, score)

    st.session_state.quiz_index += 1
    st.session_state.quiz_revealed = False
    st.session_state.quiz_submitted = False
    st.session_state.quiz_picked = ""
    st.session_state.quiz_typed = ""
    st.session_state.quiz_input_key += 1


# ---------- result ----------

def _render_result() -> None:
    results = st.session_state.quiz_results
    summary = quiz.summarize(results)

    if not _ss("quiz_session_ended") and _ss("quiz_session_id"):
        storage.end_session(
            st.session_state.quiz_session_id, summary["total"], summary["avg_score"]
        )
        st.session_state.quiz_session_ended = True

    audio.play_sound("complete")
    if summary["total"] and summary["accuracy"] >= 80:
        st.balloons()

    certificate.render_quiz_certificate(
        name=st.session_state.quiz_username,
        set_label=st.session_state.quiz_set_name.replace(".csv", ""),
        mode=st.session_state.quiz_mode,
        summary=summary,
        elapsed_seconds=time.time() - st.session_state.quiz_started_at,
    )

    wrong = [
        (qid, r) for qid, r in results.items()
        if r["verdict"] in ("miss", "partial")
    ]
    if wrong:
        st.markdown(f"### 📝 오답노트 ({len(wrong)}문제)")
        for qid, r in wrong:
            icon = "🟡" if r["verdict"] == "partial" else "❌"
            with st.expander(f"{icon} {r['question']}"):
                st.markdown(f"**정답:** {r['answer']}")
                st.caption(f"분야: {r['category']}")

    user_id = _ss("quiz_user_id")
    if user_id:
        with st.expander("📊 내 학습 통계 보기"):
            stats.render_dashboard(user_id, st.session_state.quiz_username)

    cols = st.columns(3 if wrong else 2)
    pos = 0
    if wrong:
        with cols[pos]:
            if st.button("📝 오답만 다시 풀기", type="primary", use_container_width=True):
                _retry_wrong([qid for qid, _ in wrong])
                st.rerun()
        pos += 1
    with cols[pos]:
        if st.button("🔄 새로 풀기", use_container_width=True, key="quiz_restart"):
            st.session_state.quiz_started = False
            st.rerun()
    pos += 1
    with cols[pos]:
        if st.button("🏠 처음으로", use_container_width=True, key="quiz_home_result"):
            _reset_state()
            st.session_state.selected_theme = None
            st.rerun()


def _retry_wrong(wrong_ids: list[str]) -> None:
    by_id = {q["id"]: q for q in st.session_state.quiz_bank}
    st.session_state.quiz_queue = [by_id[qid] for qid in wrong_ids if qid in by_id]
    st.session_state.quiz_index = 0
    st.session_state.quiz_results = {}
    st.session_state.quiz_revealed = False
    st.session_state.quiz_submitted = False
    st.session_state.quiz_picked = ""
    st.session_state.quiz_typed = ""
    st.session_state.quiz_input_key += 1
    st.session_state.quiz_review_round = _ss("quiz_review_round", 0) + 1
    st.session_state.quiz_started_at = time.time()
    st.session_state.quiz_session_ended = True
