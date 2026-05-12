"""Theme 2: bible book ordering game (click / typing)."""
import os
import random
import time

import streamlit as st

from . import audio, bible_data, certificate, config, data_loader, hints


def _ss(key, default=None):
    return st.session_state.get(key, default)


def _reset_state() -> None:
    for k in [k for k in st.session_state.keys() if k.startswith("ord_")]:
        del st.session_state[k]


# ---------- setup ----------

def render_setup() -> None:
    st.markdown("### 🔢 단어 순서 외우기")
    st.markdown("---")

    user_name = st.text_input("닉네임 (선택사항)", placeholder="닉네임을 입력하세요", key="ord_name_input")

    st.markdown("**데이터 선택**")
    data_source = st.radio(
        "데이터 소스",
        ["기본 데이터셋", "CSV 파일 업로드"],
        horizontal=True,
        label_visibility="collapsed",
    )

    word_list: list[str] | None = None
    dataset_name = ""

    if data_source == "기본 데이터셋":
        dataset_options = {
            "구약 39권": ["bible_books_ot.csv"],
            "신약 27권": ["bible_books_nt.csv"],
            "구약+신약 66권": ["bible_books_ot.csv", "bible_books_nt.csv"],
        }
        selected_dataset = st.selectbox("데이터셋", list(dataset_options.keys()))
        dataset_name = selected_dataset
        files = dataset_options[selected_dataset]
        combined: list[str] = []
        for f in files:
            path = os.path.join(config.DATA_DIR, f)
            if os.path.exists(path):
                combined.extend(data_loader.load_ordering_csv(path))
        if combined:
            word_list = combined
    else:
        uploaded = st.file_uploader("CSV 파일 업로드 (order, name_ko, name_en)", type=["csv"])
        if uploaded:
            result = data_loader.load_ordering_csv_from_upload(uploaded)
            if result is None:
                st.error("CSV에 order, name_ko, name_en 컬럼이 필요합니다.")
            else:
                word_list = result
                dataset_name = uploaded.name

    st.markdown("**게임 모드**")
    game_mode = st.radio(
        "모드",
        ["🖱️ 클릭 배열 - 순서대로 클릭하여 배열",
         "✍️ 받아쓰기 - 순서대로 직접 입력"],
        label_visibility="collapsed",
    )

    max_wrong = st.number_input("허용 오답 수", min_value=1, max_value=10, value=3)

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🎮 게임 시작", type="primary", use_container_width=True):
            if not word_list:
                st.error("데이터를 선택해주세요.")
                return
            _start_game(word_list, dataset_name, game_mode, max_wrong, user_name.strip())
            st.rerun()
    with col2:
        if st.button("🏠 돌아가기", use_container_width=True):
            st.session_state.selected_theme = None
            st.rerun()


def _start_game(word_list: list[str], dataset_name: str, game_mode: str,
                max_wrong: int, username: str) -> None:
    st.session_state.ord_game_started = True
    st.session_state.ord_username = username
    st.session_state.ord_mode = "클릭 배열" if "클릭" in game_mode else "받아쓰기"
    st.session_state.ord_max_wrong = max_wrong
    st.session_state.ord_wrong_count = 0
    st.session_state.ord_current_index = 0
    st.session_state.ord_correct_answers = []
    st.session_state.ord_word_list = word_list
    shuffled = list(range(len(word_list)))
    random.shuffle(shuffled)
    st.session_state.ord_shuffled_indices = shuffled
    st.session_state.ord_start_time = time.time()
    st.session_state.ord_game_over = False
    st.session_state.ord_game_clear = False
    st.session_state.ord_hint_level = 0
    st.session_state.ord_dataset_name = dataset_name
    st.session_state.ord_last_feedback = None
    st.session_state.ord_typing_key = 0


# ---------- game ----------

def render_game() -> None:
    if _ss("ord_game_clear", False):
        _render_certificate()
        return
    if _ss("ord_game_over", False):
        _render_game_over()
        return
    if st.session_state.ord_mode == "클릭 배열":
        _render_click_mode()
    else:
        _render_typing_mode()


def _render_header() -> None:
    word_list = st.session_state.ord_word_list
    total = len(word_list)
    current = st.session_state.ord_current_index
    max_wrong = st.session_state.ord_max_wrong
    wrong_count = st.session_state.ord_wrong_count
    remaining = max_wrong - wrong_count
    dataset_name = st.session_state.ord_dataset_name
    mode_label = "🖱️ 클릭 배열" if st.session_state.ord_mode == "클릭 배열" else "✍️ 받아쓰기"

    hcol1, hcol2 = st.columns([3, 1])
    with hcol1:
        st.markdown("### 🔢 단어 순서 외우기")
        st.caption(f"📊 {dataset_name} | {mode_label}")
    with hcol2:
        if st.button("🏠 홈", use_container_width=True, key="home_btn"):
            _reset_state()
            st.session_state.selected_theme = None
            st.rerun()

    hearts = "❤️" * remaining + "🖤" * wrong_count
    st.markdown(
        f'<div style="font-size:24px; text-align:center;" aria-label="남은 기회 {remaining}/{max_wrong}">{hearts}</div>',
        unsafe_allow_html=True,
    )
    st.progress(current / total if total else 0)
    st.caption(f"진행률: {current} / {total}")


def _consume_feedback() -> None:
    feedback = _ss("ord_last_feedback")
    if not feedback:
        return
    if feedback["type"] == "success":
        st.success(feedback["msg"])
    else:
        st.error(feedback["msg"])
    st.session_state.ord_last_feedback = None


def _auto_hint_if_critical() -> None:
    word_list = st.session_state.ord_word_list
    current = st.session_state.ord_current_index
    total = len(word_list)
    max_wrong = st.session_state.ord_max_wrong
    remaining = max_wrong - st.session_state.ord_wrong_count
    if remaining == 1 and current < total:
        text = hints.book_hint(word_list[current], 3, bible_data.BIBLE_BOOK_EMOJIS, bible_data.BIBLE_BOOK_HINTS)
        st.warning(text)


def _render_click_mode() -> None:
    _render_header()
    _consume_feedback()
    _auto_hint_if_critical()

    word_list = st.session_state.ord_word_list
    total = len(word_list)
    current = st.session_state.ord_current_index
    max_wrong = st.session_state.ord_max_wrong
    remaining = max_wrong - st.session_state.ord_wrong_count

    st.markdown("---")

    chosen_set = set(range(current))
    remaining_indices = [i for i in st.session_state.ord_shuffled_indices if i not in chosen_set]

    cols_per_row = 4
    rows = [remaining_indices[i:i + cols_per_row] for i in range(0, len(remaining_indices), cols_per_row)]

    for row in rows:
        cols = st.columns(cols_per_row)
        for j, word_idx in enumerate(row):
            with cols[j]:
                word = word_list[word_idx]
                emoji = bible_data.get_book_emoji(word)
                btn_label = f"{emoji} {word}" if emoji else word
                btn_type = "primary" if (remaining == 1 and word_idx == current) else "secondary"
                if st.button(btn_label, key=f"word_btn_{word_idx}_{current}",
                             use_container_width=True, type=btn_type):
                    _handle_click_answer(word_idx, word, current, total, max_wrong)
                    st.rerun()

    st.markdown("---")
    if st.session_state.ord_correct_answers:
        chain = " → ".join(
            f"{i + 1}.{bible_data.get_book_emoji(w)} {w}"
            for i, w in enumerate(st.session_state.ord_correct_answers)
        )
        st.markdown(
            f'<div class="answer-chain">✅ 정답 배열:<br>{chain}</div>',
            unsafe_allow_html=True,
        )

    if current < total:
        if st.button("💡 힌트 보기", use_container_width=True):
            st.session_state.ord_hint_level = min(2, _ss("ord_hint_level", 0) + 1)
            st.rerun()
        level = _ss("ord_hint_level", 0)
        if level > 0:
            text = hints.book_hint(word_list[current], level,
                                   bible_data.BIBLE_BOOK_EMOJIS, bible_data.BIBLE_BOOK_HINTS)
            st.info(text)


def _handle_click_answer(word_idx: int, word: str, current: int, total: int, max_wrong: int) -> None:
    if word_idx == current:
        st.session_state.ord_correct_answers.append(word)
        st.session_state.ord_current_index += 1
        st.session_state.ord_hint_level = 0
        audio.play_sound("success")
        if st.session_state.ord_current_index >= total:
            st.session_state.ord_game_clear = True
        st.session_state.ord_last_feedback = {
            "type": "success",
            "msg": f"✅ 정답! {current + 1}.{bible_data.get_book_emoji(word)} {word}",
        }
    else:
        st.session_state.ord_wrong_count += 1
        audio.play_sound("fail")
        if st.session_state.ord_wrong_count >= max_wrong:
            st.session_state.ord_game_over = True
        st.session_state.ord_last_feedback = {
            "type": "error",
            "msg": f"❌ 틀렸습니다! '{bible_data.get_book_emoji(word)} {word}'는 {current + 1}번이 아닙니다",
        }


def _render_typing_mode() -> None:
    _render_header()
    _consume_feedback()
    _auto_hint_if_critical()

    word_list = st.session_state.ord_word_list
    total = len(word_list)
    current = st.session_state.ord_current_index
    max_wrong = st.session_state.ord_max_wrong

    st.markdown("---")

    if st.session_state.ord_correct_answers:
        chain = " → ".join(
            f"{i + 1}.{bible_data.get_book_emoji(w)} {w}"
            for i, w in enumerate(st.session_state.ord_correct_answers)
        )
        st.markdown(
            f'<div class="answer-chain">✅ 지금까지 맞춘 단어:<br>{chain}</div>',
            unsafe_allow_html=True,
        )

    if current < total:
        st.markdown(f"**📝 {current + 1}번째 단어를 입력하세요:**")
        typing_key = _ss("ord_typing_key", 0)
        user_input = st.text_input(
            "단어 입력",
            key=f"ord_typing_{typing_key}",
            label_visibility="collapsed",
            placeholder="단어를 입력하세요...",
        )
        col1, col2 = st.columns([2, 1])
        with col1:
            if st.button("확인", type="primary", use_container_width=True):
                _handle_typing_answer(user_input, word_list[current], current, total, max_wrong, typing_key)
                st.rerun()
        with col2:
            if st.button("💡 힌트 보기", use_container_width=True, key="hint_typing"):
                st.session_state.ord_hint_level = min(2, _ss("ord_hint_level", 0) + 1)
                st.rerun()
        level = _ss("ord_hint_level", 0)
        if level > 0:
            text = hints.book_hint(word_list[current], level,
                                   bible_data.BIBLE_BOOK_EMOJIS, bible_data.BIBLE_BOOK_HINTS)
            st.info(text)


def _handle_typing_answer(user_input: str, answer: str, current: int, total: int,
                          max_wrong: int, typing_key: int) -> None:
    if user_input.strip() == answer:
        st.session_state.ord_correct_answers.append(answer)
        st.session_state.ord_current_index += 1
        st.session_state.ord_hint_level = 0
        st.session_state.ord_typing_key = typing_key + 1
        audio.play_sound("success")
        if st.session_state.ord_current_index >= total:
            st.session_state.ord_game_clear = True
        st.session_state.ord_last_feedback = {
            "type": "success",
            "msg": f"✅ 정답! {current + 1}.{bible_data.get_book_emoji(answer)} {answer}",
        }
    elif user_input.strip():
        st.session_state.ord_wrong_count += 1
        st.session_state.ord_typing_key = typing_key + 1
        audio.play_sound("fail")
        if st.session_state.ord_wrong_count >= max_wrong:
            st.session_state.ord_game_over = True
        st.session_state.ord_last_feedback = {"type": "error", "msg": "❌ 틀렸습니다!"}


def _render_game_over() -> None:
    st.markdown("<h2 style='text-align:center;'>😢 게임 오버</h2>", unsafe_allow_html=True)
    word_list = st.session_state.ord_word_list
    total = len(word_list)
    matched = len(st.session_state.ord_correct_answers)
    st.markdown(
        f"<p style='text-align:center; font-size:20px;'>{matched} / {total} 단어까지 맞췄습니다</p>",
        unsafe_allow_html=True,
    )

    st.markdown("---")
    st.markdown("**📋 전체 정답 목록:**")
    items = [f"{i + 1}.{bible_data.get_book_emoji(w)} {w}" for i, w in enumerate(word_list)]
    for i in range(0, len(items), 5):
        st.markdown("  ".join(items[i:i + 5]))

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 다시 도전하기", type="primary", use_container_width=True):
            _restart_game()
            st.rerun()
    with col2:
        if st.button("🏠 처음으로", use_container_width=True, key="home_gameover"):
            _reset_state()
            st.session_state.selected_theme = None
            st.rerun()


def _render_certificate() -> None:
    st.balloons()
    audio.play_sound("complete")
    elapsed = time.time() - st.session_state.ord_start_time
    certificate.render_ordering_certificate(
        name=st.session_state.ord_username,
        dataset=st.session_state.ord_dataset_name,
        mode=st.session_state.ord_mode,
        elapsed_seconds=elapsed,
        wrong_count=st.session_state.ord_wrong_count,
    )

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 다시 도전하기", type="primary", use_container_width=True, key="retry_clear"):
            _restart_game()
            st.rerun()
    with col2:
        if st.button("🏠 처음으로", use_container_width=True, key="home_clear"):
            _reset_state()
            st.session_state.selected_theme = None
            st.rerun()


def _restart_game() -> None:
    saved = {
        "word_list": st.session_state.ord_word_list,
        "mode": st.session_state.ord_mode,
        "max_wrong": st.session_state.ord_max_wrong,
        "username": st.session_state.ord_username,
        "dataset": st.session_state.ord_dataset_name,
    }
    _reset_state()
    st.session_state.selected_theme = "ordering"
    st.session_state.ord_game_started = True
    st.session_state.ord_username = saved["username"]
    st.session_state.ord_mode = saved["mode"]
    st.session_state.ord_max_wrong = saved["max_wrong"]
    st.session_state.ord_wrong_count = 0
    st.session_state.ord_current_index = 0
    st.session_state.ord_correct_answers = []
    st.session_state.ord_word_list = saved["word_list"]
    shuffled = list(range(len(saved["word_list"])))
    random.shuffle(shuffled)
    st.session_state.ord_shuffled_indices = shuffled
    st.session_state.ord_start_time = time.time()
    st.session_state.ord_game_over = False
    st.session_state.ord_game_clear = False
    st.session_state.ord_hint_level = 0
    st.session_state.ord_dataset_name = saved["dataset"]
    st.session_state.ord_last_feedback = None
    st.session_state.ord_typing_key = 0
