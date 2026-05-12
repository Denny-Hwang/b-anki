"""Theme 1: verse memorization (study / recite / dictate)."""
import os
import random
from datetime import date

import pandas as pd
import streamlit as st

from . import audio, certificate, config, data_loader, grading, hints, srs, stats, storage, styles


# ---------- session helpers ----------

def _ss(key: str, default=None):
    return st.session_state.get(key, default)


def _init_session(df: pd.DataFrame, shuffle: bool, use_srs: bool, user_id: int, set_name: str) -> None:
    indices = list(range(len(df)))
    if use_srs and user_id:
        locations = [df.iloc[i]["location"] for i in indices]
        states = storage.load_card_states(user_id, set_name, locations)
        card_states = {indices[i]: states.get(locations[i], srs.CardState()) for i in range(len(indices))}
        indices = srs.sort_for_session(card_states, indices)
        st.session_state.verse_card_states = card_states
    elif shuffle:
        random.shuffle(indices)
        st.session_state.verse_card_states = {}
    else:
        st.session_state.verse_card_states = {}

    st.session_state.verse_order = indices
    st.session_state.verse_current_idx = 0
    st.session_state.verse_show = False
    st.session_state.verse_completed = set()
    st.session_state.verse_skipped = set()
    st.session_state.verse_started = True
    st.session_state.verse_history = []
    st.session_state.verse_mode_results = {}
    st.session_state.verse_dict_submitted = False
    st.session_state.verse_dict_input = ""
    st.session_state.verse_all_done = False
    st.session_state.verse_hint_level = 0
    st.session_state.verse_learn_phase = "reading"
    st.session_state.verse_use_srs = use_srs
    st.session_state.verse_session_started_at = None


# ---------- setup ----------

def render_setup_page() -> None:
    st.markdown("---")

    files = data_loader.list_verse_files()
    if not files:
        st.warning("data/ 폴더에 CSV 파일이 없습니다.")
        return

    selected_file = st.selectbox("학습할 파일", files, index=0)
    version_label = st.selectbox("성경 버전", list(config.BIBLE_VERSIONS.keys()))

    app_mode = st.radio(
        "모드 선택",
        ["학습", "테스트"],
        captions=[
            "구절을 보고 암기한 후 가려서 확인합니다",
            "암기한 구절을 테스트합니다",
        ],
        horizontal=True,
    )

    test_sub_mode = None
    if app_mode == "테스트":
        test_sub_mode = st.radio(
            "테스트 방식",
            ["암송", "받아쓰기"],
            captions=[
                "구절을 가리고 기억해서 확인합니다",
                "직접 타이핑하여 정확도를 확인합니다",
            ],
            horizontal=True,
        )

    qp = st.query_params
    default_name = st.session_state.get("last_user_name") or qp.get("user", "")
    user_name = st.text_input("이름 (선택사항, 통계 추적용)", value=default_name, placeholder="이름을 입력하세요")

    advanced = st.expander("⚙️ 고급 옵션", expanded=False)
    with advanced:
        col_a, col_b = st.columns(2)
        with col_a:
            shuffle = st.toggle("랜덤 순서", value=False)
        with col_b:
            use_srs = st.toggle(
                "간격 반복 학습 (SRS)",
                value=True,
                help="어려웠던 카드는 더 자주, 쉬운 카드는 더 드물게 노출됩니다",
            )

    if user_name.strip():
        storage.init_db()
        user_id = storage.get_or_create_user(user_name.strip())
        due_count = storage.get_due_count(user_id, selected_file, date.today())
        if due_count > 0:
            st.info(f"📅 오늘 복습할 카드: **{due_count}개**")

    if st.button("시작하기", type="primary", use_container_width=True):
        verse_col = config.BIBLE_VERSIONS[version_label]
        df = data_loader.load_verse_csv(os.path.join(config.DATA_DIR, selected_file))
        if verse_col not in df.columns:
            st.error(f"선택한 파일에 '{verse_col}' 열이 없습니다.")
            return

        user_id = None
        session_id = None
        if user_name.strip():
            storage.init_db()
            user_id = storage.get_or_create_user(user_name.strip())
            mode_label = app_mode if app_mode == "학습" else f"테스트-{test_sub_mode}"
            session_id = storage.start_session(user_id, selected_file, mode_label)

        _init_session(df, shuffle, use_srs and user_id is not None, user_id or 0, selected_file)

        st.session_state.verse_setup_done = True
        st.session_state.verse_loaded_file = selected_file
        st.session_state.verse_loaded_version = version_label
        st.session_state.verse_verse_col = verse_col
        st.session_state.verse_app_mode = app_mode
        st.session_state.verse_mode = test_sub_mode if app_mode == "테스트" else "학습"
        st.session_state.verse_user_name = user_name.strip()
        st.session_state.verse_user_id = user_id
        st.session_state.verse_session_id = session_id
        st.session_state.verse_shuffle = shuffle
        if user_name.strip():
            st.session_state.last_user_name = user_name.strip()
            st.query_params["user"] = user_name.strip()
        st.rerun()


# ---------- main loop ----------

def render_main_page() -> None:
    selected_file = st.session_state.verse_loaded_file
    verse_col = st.session_state.verse_verse_col
    app_mode = st.session_state.verse_app_mode
    mode = st.session_state.verse_mode
    user_id = _ss("verse_user_id")

    df = data_loader.load_verse_csv(os.path.join(config.DATA_DIR, selected_file))
    total = len(df)

    _render_top_bar(total)

    if st.session_state.verse_all_done:
        _finish_session(df, verse_col)
        return

    order = st.session_state.verse_order
    idx = st.session_state.verse_current_idx
    while idx < len(order) and order[idx] in st.session_state.verse_completed:
        idx += 1
    st.session_state.verse_current_idx = idx

    if idx >= len(order):
        _handle_end_of_queue()
        return

    row = df.iloc[order[idx]]
    location = row["location"]
    verse_text = row[verse_col]

    st.markdown("---")
    st.markdown(f'<div class="verse-location">📍 {location}</div>', unsafe_allow_html=True)

    if app_mode == "학습":
        _render_learning(verse_text, order, idx, location)
    elif mode == "암송":
        _render_recitation(verse_text, order, idx, location)
    else:
        _render_dictation(verse_text, order, idx, location)


def _render_top_bar(total: int) -> None:
    font_size = styles.get_font_size()
    fcol1, fcol2, fcol3, fcol4 = st.columns([1, 1, 2, 1])
    with fcol1:
        if st.button("A-", use_container_width=True, help="글자 작게"):
            styles.set_font_size(font_size - config.FONT_STEP)
            st.rerun()
    with fcol2:
        if st.button("A+", use_container_width=True, help="글자 크게"):
            styles.set_font_size(font_size + config.FONT_STEP)
            st.rerun()
    with fcol3:
        st.caption(f"글자 크기: {font_size}px")
    with fcol4:
        if st.button("🏠 홈", use_container_width=True, help="테마 선택으로"):
            _reset_to_home()
            st.rerun()

    completed_count = len(st.session_state.verse_completed)
    st.progress(completed_count / total if total else 0)
    app_mode = st.session_state.verse_app_mode
    mode = st.session_state.verse_mode
    mode_display = "학습" if app_mode == "학습" else f"테스트 ({mode})"
    st.caption(f"진행: {completed_count} / {total}  |  모드: {mode_display}")


def _handle_end_of_queue() -> None:
    remaining_skipped = st.session_state.verse_skipped - st.session_state.verse_completed
    if remaining_skipped:
        st.info(f"건너뛴 구절: {len(remaining_skipped)}개")
        skip_col1, skip_col2 = st.columns(2)
        with skip_col1:
            if st.button("건너뛴 구절 다시 학습", use_container_width=True):
                skipped_list = list(remaining_skipped)
                if st.session_state.verse_shuffle:
                    random.shuffle(skipped_list)
                st.session_state.verse_order = skipped_list
                st.session_state.verse_current_idx = 0
                st.session_state.verse_skipped = set()
                st.session_state.verse_show = False
                st.session_state.verse_dict_submitted = False
                st.session_state.verse_learn_phase = "reading"
                st.rerun()
        with skip_col2:
            if st.button("그냥 완료하기", type="primary", use_container_width=True):
                st.session_state.verse_all_done = True
                st.rerun()
    else:
        st.session_state.verse_all_done = True
        st.rerun()


def _finish_session(df: pd.DataFrame, verse_col: str) -> None:
    user_id = _ss("verse_user_id")
    session_id = _ss("verse_session_id")
    results = st.session_state.verse_mode_results
    total = len(df)

    if session_id and not _ss("verse_session_ended"):
        scores = [r["score"] for r in results.values() if "score" in r]
        avg = sum(scores) / len(scores) if scores else None
        storage.end_session(session_id, len(results), avg)
        st.session_state.verse_session_ended = True

    audio.play_sound("complete")
    st.balloons()

    certificate.render_verse_certificate(
        st.session_state.verse_user_name,
        results,
        total,
        st.session_state.verse_loaded_file.replace(".csv", ""),
    )

    if user_id:
        with st.expander("📊 내 학습 통계 보기"):
            stats.render_dashboard(user_id, st.session_state.verse_user_name)
            stats.render_hard_cards(user_id, st.session_state.verse_loaded_file)

    if st.button("처음으로 돌아가기", type="primary", use_container_width=True):
        _reset_to_home()
        st.rerun()


# ---------- mode renderers ----------

def _render_learning(verse_text: str, order: list, idx: int, location: str) -> None:
    phase = st.session_state.verse_learn_phase

    if phase == "reading":
        st.markdown(
            f'<div class="verse-text" role="region" aria-label="구절 본문">{verse_text}</div>',
            unsafe_allow_html=True,
        )
        _render_tts_for(verse_text)
        _learning_reading_buttons(order, idx, location)
        return

    if phase == "hidden":
        _render_hidden_or_hint(verse_text)
        hint_col, show_col = st.columns([1, 2])
        with hint_col:
            if st.button("💡 힌트", use_container_width=True, help="점진적 힌트"):
                st.session_state.verse_hint_level = min(4, st.session_state.verse_hint_level + 1)
                st.rerun()
        with show_col:
            if st.button("👀 구절 확인", type="primary", use_container_width=True):
                st.session_state.verse_learn_phase = "reading"
                st.session_state.verse_hint_level = 0
                st.rerun()

        st.markdown("---")
        st.caption("✍️ 타이핑으로 확인해보기 (선택)")
        card_key = f"learn_typing_{order[idx]}"
        user_input = st.text_area(
            "기억나는 구절을 입력하세요",
            key=card_key,
            height=120,
            placeholder="기억나는 대로 입력하세요...",
            label_visibility="collapsed",
        )
        col1, col2 = st.columns(2)
        with col1:
            if st.button("✍️ 확인하기", use_container_width=True):
                st.session_state.verse_dict_input = user_input
                st.session_state.verse_learn_phase = "result"
                st.session_state.verse_hint_level = 0
                st.rerun()
        with col2:
            if st.button("✅ 학습완료", use_container_width=True, key="learn_done_hidden"):
                _record_completion(order, idx, location, score=None, rating=srs.GOOD)
                st.rerun()
        return

    if phase == "result":
        user_input = st.session_state.verse_dict_input
        result = grading.compute_word_match(user_input, verse_text)
        _render_score_block(result, verse_text)
        st.markdown("**정답:**")
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True,
        )
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("🔄 다시 연습", use_container_width=True):
                st.session_state.verse_learn_phase = "hidden"
                st.session_state.verse_dict_input = ""
                st.rerun()
        with col2:
            if st.button("👀 다시 읽기", use_container_width=True):
                st.session_state.verse_learn_phase = "reading"
                st.session_state.verse_dict_input = ""
                st.rerun()
        with col3:
            if st.button("✅ 학습완료", type="primary", use_container_width=True, key="learn_done_result"):
                rating = srs.rating_from_score(result["score"])
                _record_completion(order, idx, location, score=result["score"], rating=rating)
                st.rerun()


def _learning_reading_buttons(order: list, idx: int, location: str) -> None:
    has_history = len(st.session_state.verse_history) > 0
    cols = st.columns(4 if has_history else 3)

    pos = 0
    if has_history:
        with cols[pos]:
            if st.button("⬅️ 이전", use_container_width=True):
                _go_previous()
                st.rerun()
        pos += 1

    with cols[pos]:
        if st.button("⏭️ 건너뛰기", use_container_width=True):
            st.session_state.verse_history.append(order[idx])
            st.session_state.verse_skipped.add(order[idx])
            st.session_state.verse_current_idx += 1
            st.session_state.verse_learn_phase = "reading"
            st.session_state.verse_hint_level = 0
            st.rerun()
    pos += 1

    with cols[pos]:
        if st.button("🙈 가리기", type="primary", use_container_width=True):
            st.session_state.verse_learn_phase = "hidden"
            st.session_state.verse_hint_level = 0
            st.rerun()
    pos += 1

    with cols[pos]:
        if st.button("✅ 학습완료", use_container_width=True):
            _record_completion(order, idx, location, score=None, rating=srs.GOOD)
            st.rerun()


def _render_recitation(verse_text: str, order: list, idx: int, location: str) -> None:
    show = st.session_state.verse_show
    if show:
        st.markdown(f'<div class="verse-text">{verse_text}</div>', unsafe_allow_html=True)
        _render_tts_for(verse_text)
    else:
        _render_hidden_or_hint(verse_text, idle_msg="👇 아래 버튼을 눌러 구절을 확인하세요")
        hint_col, show_col = st.columns([1, 2])
        with hint_col:
            if st.button("💡 힌트", use_container_width=True):
                st.session_state.verse_hint_level = min(4, st.session_state.verse_hint_level + 1)
                st.rerun()
        with show_col:
            if st.button("구절 확인", type="primary", use_container_width=True):
                st.session_state.verse_show = True
                st.session_state.verse_hint_level = 0
                st.rerun()

    if show:
        _render_ease_rating_row(verse_text, order, idx, location, with_replay=True)
    else:
        if len(st.session_state.verse_history) > 0:
            if st.button("⬅️ 이전", use_container_width=True):
                _go_previous()
                st.rerun()


def _render_dictation(verse_text: str, order: list, idx: int, location: str) -> None:
    if not st.session_state.verse_dict_submitted:
        _render_hidden_or_hint(verse_text, idle_msg="✍️ 아래에 기억나는 구절을 입력하세요")
        card_key = f"dictation_{order[idx]}"
        user_input = st.text_area(
            "구절을 입력하세요",
            key=card_key,
            height=150,
            placeholder="기억나는 대로 구절을 입력하세요...",
            label_visibility="collapsed",
        )

        if st.button("💡 힌트", use_container_width=True):
            st.session_state.verse_hint_level = min(4, st.session_state.verse_hint_level + 1)
            st.rerun()

        has_history = len(st.session_state.verse_history) > 0
        cols = st.columns(3 if has_history else 2)
        pos = 0
        if has_history:
            with cols[pos]:
                if st.button("⬅️ 이전", use_container_width=True):
                    _go_previous()
                    st.rerun()
            pos += 1
        with cols[pos]:
            if st.button("⏭️ 건너뛰기", use_container_width=True):
                st.session_state.verse_history.append(order[idx])
                st.session_state.verse_skipped.add(order[idx])
                st.session_state.verse_current_idx += 1
                st.session_state.verse_dict_submitted = False
                st.session_state.verse_hint_level = 0
                st.rerun()
        pos += 1
        with cols[pos]:
            if st.button("제출", type="primary", use_container_width=True):
                st.session_state.verse_dict_input = user_input
                st.session_state.verse_dict_submitted = True
                st.session_state.verse_hint_level = 0
                st.rerun()
        return

    user_input = st.session_state.verse_dict_input
    result = grading.compute_word_match(user_input, verse_text)
    if result["score"] >= 80:
        audio.play_sound("success")
    elif result["score"] < 50:
        audio.play_sound("fail")

    _render_score_block(result, verse_text)
    st.markdown("**정답:**")
    st.markdown(f'<div class="verse-text">{verse_text}</div>', unsafe_allow_html=True)
    _render_tts_for(verse_text)
    _render_ease_rating_row(verse_text, order, idx, location, score=result["score"],
                            with_retry=True, with_replay=False)


# ---------- shared building blocks ----------

def _render_hidden_or_hint(verse_text: str, idle_msg: str = "🤔 구절을 떠올려 보세요") -> None:
    level = st.session_state.verse_hint_level
    if level > 0:
        hint_text = hints.verse_hint(verse_text, level - 1)
        st.markdown(f'<div class="hint-display">{hint_text}</div>', unsafe_allow_html=True)
    else:
        st.markdown(
            f'<div class="verse-hidden" role="status">{idle_msg}</div>',
            unsafe_allow_html=True,
        )


def _render_score_block(result: dict, verse_text: str) -> None:
    score = result["score"]
    score_class = config.classify_score(score)
    st.markdown(
        f'<div class="{score_class} score-display" aria-live="polite">{score}%</div>',
        unsafe_allow_html=True,
    )
    matched = result["matched_words"]
    partial = result["partial_words"]
    total = result["total_words"]
    partial_str = f" + 부분일치 {partial}개" if partial else ""
    st.markdown(f"**{matched}** / {total} 단어 일치{partial_str}")
    comparison_html = grading.render_word_comparison_html(result)
    st.markdown(f'<div class="dictation-result">{comparison_html}</div>', unsafe_allow_html=True)


def _render_tts_for(verse_text: str) -> None:
    version = _ss("verse_loaded_version", "개역개정")
    lang = "ko-KR" if version == "개역개정" else "en-US"
    audio.speak_verse(verse_text, lang=lang)


def _render_ease_rating_row(verse_text: str, order: list, idx: int, location: str,
                            score: int | None = None,
                            with_retry: bool = False, with_replay: bool = True) -> None:
    """Show SRS rating buttons + navigation. Only emit ratings when SRS is on."""
    has_history = len(st.session_state.verse_history) > 0
    use_srs = _ss("verse_use_srs", False)

    if use_srs:
        st.caption("이 구절의 난이도를 선택하면 다음 복습 일정이 자동으로 조정됩니다")
        rcols = st.columns(4)
        labels = [
            (srs.AGAIN, "🔁 다시", "1일 후 다시"),
            (srs.HARD, "😅 어려움", "짧게 다시 복습"),
            (srs.GOOD, "🙂 괜찮음", "표준 간격"),
            (srs.EASY, "🎉 쉬움", "길게 미루기"),
        ]
        for col, (rating, label, helptext) in zip(rcols, labels):
            with col:
                if st.button(label, use_container_width=True, key=f"ease_{rating}_{order[idx]}",
                             help=helptext):
                    _record_completion(order, idx, location, score=score, rating=rating)
                    st.rerun()

    nav_cols = st.columns(4 if has_history else 3)
    pos = 0
    if has_history:
        with nav_cols[pos]:
            if st.button("⬅️ 이전", use_container_width=True, key=f"prev_{order[idx]}"):
                _go_previous()
                st.rerun()
        pos += 1
    with nav_cols[pos]:
        if st.button("⏭️ 건너뛰기", use_container_width=True, key=f"skip_{order[idx]}"):
            st.session_state.verse_history.append(order[idx])
            st.session_state.verse_skipped.add(order[idx])
            st.session_state.verse_current_idx += 1
            st.session_state.verse_show = False
            st.session_state.verse_dict_submitted = False
            st.session_state.verse_hint_level = 0
            st.rerun()
    pos += 1
    if with_retry:
        with nav_cols[pos]:
            if st.button("🔄 다시 도전", use_container_width=True, key=f"retry_{order[idx]}"):
                st.session_state.verse_dict_submitted = False
                st.session_state.verse_dict_input = ""
                st.rerun()
        pos += 1
    elif with_replay:
        with nav_cols[pos]:
            if st.button("🔄 다시보기", use_container_width=True, key=f"replay_{order[idx]}"):
                st.session_state.verse_show = False
                st.session_state.verse_hint_level = 0
                st.rerun()
        pos += 1

    if not use_srs and pos < len(nav_cols):
        with nav_cols[pos]:
            label = "✅ 완료" if not with_retry else "➡️ 다음"
            if st.button(label, type="primary", use_container_width=True, key=f"done_{order[idx]}"):
                rating = srs.rating_from_score(score) if score is not None else srs.GOOD
                _record_completion(order, idx, location, score=score, rating=rating)
                st.rerun()


def _record_completion(order: list, idx: int, location: str, score: int | None, rating: int) -> None:
    card_idx = order[idx]
    st.session_state.verse_history.append(card_idx)
    st.session_state.verse_completed.add(card_idx)
    st.session_state.verse_skipped.discard(card_idx)
    payload = {"completed": True, "rating": rating}
    if score is not None:
        payload["score"] = score
        payload["matched"] = score
    st.session_state.verse_mode_results[location] = payload

    user_id = _ss("verse_user_id")
    if user_id:
        set_name = st.session_state.verse_loaded_file
        prev_state = storage.get_card_state(user_id, set_name, location)
        new_state = srs.review(prev_state, rating)
        storage.save_card_state(user_id, set_name, location, new_state)
        storage.log_review(user_id, set_name, location, rating, score)

    st.session_state.verse_current_idx += 1
    st.session_state.verse_show = False
    st.session_state.verse_dict_submitted = False
    st.session_state.verse_dict_input = ""
    st.session_state.verse_hint_level = 0
    st.session_state.verse_learn_phase = "reading"


def _go_previous() -> None:
    history = st.session_state.verse_history
    if not history:
        return
    prev_card = history.pop()
    st.session_state.verse_completed.discard(prev_card)
    st.session_state.verse_skipped.discard(prev_card)
    order = st.session_state.verse_order
    try:
        st.session_state.verse_current_idx = order.index(prev_card)
    except ValueError:
        st.session_state.verse_order.insert(st.session_state.verse_current_idx, prev_card)
    st.session_state.verse_show = False
    st.session_state.verse_dict_submitted = False
    st.session_state.verse_dict_input = ""
    st.session_state.verse_hint_level = 0
    st.session_state.verse_learn_phase = "reading"


def _reset_to_home() -> None:
    keep = {"font_size"}
    for k in list(st.session_state.keys()):
        if k not in keep:
            del st.session_state[k]
    st.session_state.selected_theme = None
