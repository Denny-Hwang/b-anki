import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import random
import os
import time

BIBLE_VERSIONS = {
    "개역개정": "verse_krv",
    "NIV": "verse_niv",
}

DEFAULT_FILE = "kpccw 2026 성경암송.csv"
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEFAULT_FONT_SIZE = 28
MIN_FONT_SIZE = 16
MAX_FONT_SIZE = 60
FONT_STEP = 4


def load_csv(file_path: str) -> pd.DataFrame:
    return pd.read_csv(file_path)


def get_available_files() -> list[str]:
    if not os.path.isdir(DATA_DIR):
        return []
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".csv") and not f.startswith("bible_books_")]
    if DEFAULT_FILE in files:
        files.remove(DEFAULT_FILE)
        files.insert(0, DEFAULT_FILE)
    return files


def init_session_state(df: pd.DataFrame, shuffle: bool):
    indices = list(range(len(df)))
    if shuffle:
        random.shuffle(indices)
    st.session_state.order = indices
    st.session_state.current_idx = 0
    st.session_state.show_verse = False
    st.session_state.completed = set()
    st.session_state.skipped = set()
    st.session_state.started = True
    st.session_state.history = []
    st.session_state.mode_results = {}
    st.session_state.dictation_submitted = False
    st.session_state.dictation_input = ""
    st.session_state.all_done = False
    st.session_state.hint_word = None
    st.session_state.learn_phase = "reading"


def inject_font_persistence_js():
    """Inject JS to persist font size in localStorage and load on startup."""
    st.markdown("""
    <script>
    (function() {
        const saved = localStorage.getItem('banki_font_size');
        if (saved) {
            const event = new CustomEvent('banki_font_loaded', {detail: saved});
            window.dispatchEvent(event);
        }
    })();
    function saveBankiFont(size) {
        localStorage.setItem('banki_font_size', size);
    }
    </script>
    """, unsafe_allow_html=True)


def get_font_size():
    if "font_size" not in st.session_state:
        st.session_state.font_size = DEFAULT_FONT_SIZE
    return st.session_state.font_size


def compute_word_match(user_text: str, answer_text: str) -> dict:
    """Compare user input with answer text word by word, ignoring spaces."""
    def normalize(text):
        return text.replace(" ", "").replace("\u3000", "")

    def split_words(text):
        return [w for w in text.split() if w]

    answer_words = split_words(answer_text)
    user_words = split_words(user_text)

    user_joined = normalize(user_text)
    answer_joined = normalize(answer_text)

    if not answer_words:
        return {"score": 100, "total_words": 0, "matched_words": 0,
                "answer_words": [], "user_words": [], "word_results": []}

    matched = 0
    word_results = []

    for i, aw in enumerate(answer_words):
        if i < len(user_words):
            uw = user_words[i]
            aw_norm = normalize(aw)
            uw_norm = normalize(uw)
            is_match = aw_norm == uw_norm
            if is_match:
                matched += 1
            word_results.append({
                "answer": aw,
                "user": uw,
                "match": is_match
            })
        else:
            word_results.append({
                "answer": aw,
                "user": "",
                "match": False
            })

    for i in range(len(answer_words), len(user_words)):
        word_results.append({
            "answer": "",
            "user": user_words[i],
            "match": False
        })

    score = round((matched / len(answer_words)) * 100) if answer_words else 0

    return {
        "score": score,
        "total_words": len(answer_words),
        "matched_words": matched,
        "answer_words": answer_words,
        "user_words": user_words,
        "word_results": word_results,
    }


def render_word_comparison(result: dict):
    """Render word-by-word comparison with color coding."""
    html_parts = []
    for wr in result["word_results"]:
        if wr["match"]:
            html_parts.append(
                f'<span style="color:#22c55e;font-weight:bold;">{wr["answer"]}</span>'
            )
        elif wr["user"] == "":
            html_parts.append(
                f'<span style="color:#ef4444;text-decoration:underline;">{wr["answer"]}</span>'
            )
        elif wr["answer"] == "":
            html_parts.append(
                f'<span style="color:#f59e0b;text-decoration:line-through;">{wr["user"]}</span>'
            )
        else:
            html_parts.append(
                f'<span style="color:#ef4444;">'
                f'<s>{wr["user"]}</s> → {wr["answer"]}</span>'
            )
    return " ".join(html_parts)


def render_certificate(name: str, results: dict, total: int, df: pd.DataFrame, verse_col: str):
    """Render a completion certificate."""
    completed_count = len([r for r in results.values() if results])
    avg_score = 0
    has_dictation = any("score" in v for v in results.values())

    if has_dictation:
        scores = [v["score"] for v in results.values() if "score" in v]
        avg_score = round(sum(scores) / len(scores)) if scores else 0

    name_display = name if name else "수고하신 분"

    grade = ""
    if has_dictation:
        if avg_score >= 95:
            grade = "S"
        elif avg_score >= 90:
            grade = "A+"
        elif avg_score >= 80:
            grade = "A"
        elif avg_score >= 70:
            grade = "B"
        elif avg_score >= 60:
            grade = "C"
        else:
            grade = "D"

    score_html = ""
    if has_dictation:
        score_html = (
            '<p style="font-size:20px; color:#333; margin:15px 0;">'
            "평균 정확도: <b>" + str(avg_score) + "%</b> "
            "(등급: <b>" + grade + "</b>)</p>"
        )

    html = (
        '<div style="'
        "border: 4px double #d4af37;"
        "border-radius: 20px;"
        "padding: 40px 30px;"
        "margin: 20px auto;"
        "max-width: 600px;"
        "text-align: center;"
        "background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%);"
        "box-shadow: 0 4px 20px rgba(0,0,0,0.1);"
        '">'
        '<div style="font-size:48px; margin-bottom:10px;">🏆</div>'
        '<h1 style="font-family: Georgia, serif; color: #92400e; font-size: 32px; margin-bottom: 5px;">수 료 증</h1>'
        '<p style="color:#b45309; font-size:14px; margin-bottom:25px;">KPCCW 2026 성경암송</p>'
        '<hr style="border:1px solid #d4af37; margin: 15px 40px;">'
        '<p style="font-size:28px; font-weight:bold; color:#1e3a5f; margin:20px 0;">'
        + name_display
        + "</p>"
        '<p style="font-size:16px; color:#555; margin:10px 0;">'
        "위 사람은 성경 암송 " + str(total) + "구절을 모두 마쳤음을 증명합니다.</p>"
        + score_html
        + '<hr style="border:1px solid #d4af37; margin: 15px 40px;">'
        '<p style="font-size:15px; color:#555; margin:5px 20px 0; font-style:italic;">'
        '"이 율법책을 네 입에서 떠나지 말게 하며</p>'
        '<p style="font-size:15px; color:#555; margin:2px 20px 0; font-style:italic;">'
        "주야로 그것을 묵상하여</p>"
        '<p style="font-size:15px; color:#555; margin:2px 20px 10px; font-style:italic;">'
        '그 가운데 기록한 대로 다 지켜 행하라"</p>'
        '<p style="font-size:13px; color:#888; margin-bottom:15px;">— 여호수아 1:8</p>'
        '<p style="font-size:16px; color:#92400e; font-weight:bold; margin-bottom:3px;">'
        "축하합니다! 🎉</p>"
        '<p style="font-size:16px; color:#92400e; font-weight:bold; margin-top:0;">'
        "하나님의 말씀을 마음에 새기는 귀한 시간이었습니다.</p>"
        '<p style="font-size:11px; color:#bbb; margin-top:20px;">KPCCW 2026 성경암송</p>'
        "</div>"
    )
    st.markdown(html, unsafe_allow_html=True)

    if has_dictation:
        with st.expander("구절별 상세 결과 보기"):
            for idx_key, res in results.items():
                if "score" in res:
                    row = df.iloc[idx_key]
                    icon = "✅" if res["score"] >= 80 else "⚠️" if res["score"] >= 50 else "❌"
                    st.markdown(f"{icon} **{row['location']}** — {res['score']}%")


def inject_styles():
    """Inject all CSS styles."""
    font_size = get_font_size()
    st.markdown(f"""
    <style>
        .verse-location {{
            font-size: {max(font_size - 4, 14)}px;
            font-weight: bold;
            color: #1e3a5f;
            text-align: center;
            margin-bottom: 10px;
        }}
        .verse-text {{
            font-size: {font_size}px;
            line-height: 1.6;
            text-align: center;
            padding: 20px;
            background: #f8fafc;
            border-radius: 12px;
            border-left: 4px solid #3b82f6;
            margin: 10px 0;
            min-height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1e293b;
        }}
        .verse-hidden {{
            font-size: {font_size}px;
            text-align: center;
            padding: 40px 20px;
            background: #f1f5f9;
            border-radius: 12px;
            border: 2px dashed #94a3b8;
            margin: 10px 0;
            color: #94a3b8;
            min-height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .font-controls {{
            display: flex;
            justify-content: center;
            gap: 8px;
            margin: 8px 0;
        }}
        .dictation-result {{
            font-size: {max(font_size - 6, 14)}px;
            line-height: 1.8;
            padding: 15px;
            background: #f8fafc;
            border-radius: 12px;
            margin: 10px 0;
            color: #1e293b;
        }}
        .score-display {{
            font-size: 48px;
            font-weight: bold;
            text-align: center;
            margin: 10px 0;
        }}
        .score-good {{ color: #22c55e; }}
        .score-ok {{ color: #f59e0b; }}
        .score-bad {{ color: #ef4444; }}
        .hint-display {{
            font-size: {font_size}px;
            text-align: center;
            padding: 15px;
            background: #fffbeb;
            border-radius: 12px;
            border: 2px solid #f59e0b;
            margin: 10px 0;
            color: #92400e !important;
            font-weight: bold;
        }}
        div[data-testid="stMainBlockContainer"] {{
            max-width: 800px;
        }}
    </style>
    """, unsafe_allow_html=True)


def main():
    st.set_page_config(page_title="B-Anki", page_icon="📖", layout="centered")

    inject_styles()

    # Theme selection
    if st.session_state.get("selected_theme") is None:
        render_theme_selection()
        return

    # Theme 1: 성경 구절 암기
    if st.session_state.selected_theme == "verse":
        st.title("📖 성경암기")
        if "setup_done" not in st.session_state:
            st.session_state.setup_done = False
        if not st.session_state.setup_done:
            render_setup_page()
        else:
            render_main_page()
        return

    # Theme 2: 단어 순서 외우기
    if st.session_state.selected_theme == "ordering":
        if not st.session_state.get("ord_game_started", False):
            render_ordering_setup()
        else:
            render_ordering_game()
        return


def render_setup_page():
    """Render the initial setup page."""
    st.markdown("---")

    files = get_available_files()
    if not files:
        st.warning("data/ 폴더에 CSV 파일이 없습니다.")
        return

    default_idx = 0
    if DEFAULT_FILE in files:
        default_idx = files.index(DEFAULT_FILE)

    selected_file = st.selectbox("학습할 파일", files, index=default_idx)

    version_label = st.selectbox("성경 버전", list(BIBLE_VERSIONS.keys()))

    app_mode = st.radio("모드 선택", ["학습", "테스트"],
                        captions=[
                            "구절을 보고 암기한 후 가려서 확인합니다",
                            "암기한 구절을 테스트합니다",
                        ],
                        horizontal=True)

    test_sub_mode = None
    if app_mode == "테스트":
        test_sub_mode = st.radio("테스트 방식", ["암송", "받아쓰기"],
                                 captions=[
                                     "구절을 가리고 기억해서 확인합니다",
                                     "직접 타이핑하여 정확도를 확인합니다",
                                 ],
                                 horizontal=True)

    shuffle = st.toggle("랜덤 순서", value=False)

    user_name = st.text_input("이름 (선택사항)", placeholder="이름을 입력하세요")

    if st.button("시작하기", type="primary", use_container_width=True):
        verse_col = BIBLE_VERSIONS[version_label]
        df = load_csv(os.path.join(DATA_DIR, selected_file))
        if verse_col not in df.columns:
            st.error(f"선택한 파일에 '{verse_col}' 열이 없습니다.")
            return

        init_session_state(df, shuffle)
        st.session_state.setup_done = True
        st.session_state.loaded_file = selected_file
        st.session_state.loaded_version = version_label
        st.session_state.verse_col = verse_col
        st.session_state.app_mode = app_mode
        if app_mode == "테스트":
            st.session_state.mode = test_sub_mode
        else:
            st.session_state.mode = "학습"
        st.session_state.user_name = user_name.strip()
        st.session_state.shuffle = shuffle
        st.rerun()


def render_main_page():
    """Render the main learning page."""
    selected_file = st.session_state.loaded_file
    verse_col = st.session_state.verse_col
    app_mode = st.session_state.app_mode
    mode = st.session_state.mode

    df = load_csv(os.path.join(DATA_DIR, selected_file))
    total = len(df)

    # --- Font size controls ---
    font_size = get_font_size()
    fcol1, fcol2, fcol3, fcol4 = st.columns([1, 1, 2, 1])
    with fcol1:
        if st.button("A-", use_container_width=True, help="글자 작게"):
            if font_size > MIN_FONT_SIZE:
                st.session_state.font_size = font_size - FONT_STEP
                st.rerun()
    with fcol2:
        if st.button("A+", use_container_width=True, help="글자 크게"):
            if font_size < MAX_FONT_SIZE:
                st.session_state.font_size = font_size + FONT_STEP
                st.rerun()
    with fcol3:
        st.caption(f"글자 크기: {font_size}px")
    with fcol4:
        if st.button("처음부터", use_container_width=True):
            st.session_state.setup_done = False
            for key in list(st.session_state.keys()):
                if key != "font_size":
                    del st.session_state[key]
            st.rerun()

    # --- Progress ---
    completed_count = len(st.session_state.completed)
    st.progress(completed_count / total if total else 0)
    if app_mode == "학습":
        mode_display = "학습"
    else:
        mode_display = f"테스트 ({mode})"
    st.caption(f"진행: {completed_count} / {total}  |  모드: {mode_display}")

    # --- Check completion ---
    if st.session_state.all_done:
        render_certificate(
            st.session_state.user_name,
            st.session_state.mode_results,
            total, df, verse_col
        )
        if st.button("처음으로 돌아가기", type="primary", use_container_width=True):
            st.session_state.setup_done = False
            for key in list(st.session_state.keys()):
                if key != "font_size":
                    del st.session_state[key]
            st.rerun()
        return

    # --- Find next card ---
    order = st.session_state.order
    idx = st.session_state.current_idx

    while idx < len(order) and order[idx] in st.session_state.completed:
        idx += 1
    st.session_state.current_idx = idx

    if idx >= len(order):
        remaining_skipped = st.session_state.skipped - st.session_state.completed
        if remaining_skipped:
            st.info(f"건너뛴 구절: {len(remaining_skipped)}개")
            skip_col1, skip_col2 = st.columns(2)
            with skip_col1:
                if st.button("건너뛴 구절 다시 학습", use_container_width=True):
                    skipped_list = list(remaining_skipped)
                    if st.session_state.shuffle:
                        random.shuffle(skipped_list)
                    st.session_state.order = skipped_list
                    st.session_state.current_idx = 0
                    st.session_state.skipped = set()
                    st.session_state.show_verse = False
                    st.session_state.dictation_submitted = False
                    st.rerun()
            with skip_col2:
                if st.button("그냥 완료하기", type="primary", use_container_width=True):
                    st.session_state.all_done = True
                    st.rerun()
        else:
            st.session_state.all_done = True
            st.rerun()
        return

    row = df.iloc[order[idx]]
    location = row["location"]
    verse_text = row[verse_col]

    # --- Card display ---
    st.markdown("---")
    st.markdown(f'<div class="verse-location">📍 {location}</div>', unsafe_allow_html=True)

    if app_mode == "학습":
        render_learning_mode(verse_text, order, idx)
    elif mode == "암송":
        render_recitation_mode(verse_text, order, idx)
    else:
        render_dictation_mode(verse_text, order, idx, location)


def render_learning_mode(verse_text: str, order: list, idx: int):
    """Render the learning (학습) mode card.

    Phases:
      reading - verse is visible, user reads and memorises
      hidden  - verse is hidden, user recalls (optional typing)
      result  - typing comparison shown
    """
    if "learn_phase" not in st.session_state:
        st.session_state.learn_phase = "reading"

    phase = st.session_state.learn_phase

    if phase == "reading":
        # --- Phase 1: verse visible ---
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True,
        )

        has_history = len(st.session_state.history) > 0
        if has_history:
            col_prev, col1, col2, col3 = st.columns(4)
        else:
            col_prev = None
            col1, col2, col3 = st.columns(3)

        if has_history:
            with col_prev:
                if st.button("⬅️ 이전", use_container_width=True):
                    go_previous()
                    st.rerun()

        with col1:
            if st.button("⏭️ 건너뛰기", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.skipped.add(order[idx])
                st.session_state.current_idx += 1
                st.session_state.learn_phase = "reading"
                st.session_state.hint_word = None
                st.rerun()

        with col2:
            if st.button("🙈 가리기", type="primary", use_container_width=True):
                st.session_state.learn_phase = "hidden"
                st.session_state.hint_word = None
                st.rerun()

        with col3:
            if st.button("✅ 학습완료", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {"completed": True}
                st.session_state.current_idx += 1
                st.session_state.learn_phase = "reading"
                st.session_state.hint_word = None
                st.rerun()

    elif phase == "hidden":
        # --- Phase 2: verse hidden, self-test ---
        if st.session_state.hint_word is not None:
            st.markdown(
                f'<div class="hint-display">💡 {st.session_state.hint_word}</div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                '<div class="verse-hidden">🤔 구절을 떠올려 보세요</div>',
                unsafe_allow_html=True,
            )

        hint_col, show_col = st.columns([1, 2])
        with hint_col:
            if st.button("💡 랜덤 힌트", use_container_width=True):
                words = [w for w in verse_text.split() if w]
                st.session_state.hint_word = random.choice(words) if words else ""
                st.rerun()
        with show_col:
            if st.button("👀 구절 확인", type="primary", use_container_width=True):
                st.session_state.learn_phase = "reading"
                st.session_state.hint_word = None
                st.rerun()

        # Optional typing practice
        st.markdown("---")
        st.caption("✍️ 타이핑으로 확인해보기 (선택)")
        current_card_key = f"learn_typing_{order[idx]}"
        user_input = st.text_area(
            "기억나는 구절을 입력하세요",
            key=current_card_key,
            height=120,
            placeholder="기억나는 대로 입력하세요...",
            label_visibility="collapsed",
        )

        col1, col2 = st.columns(2)
        with col1:
            if st.button("✍️ 확인하기", use_container_width=True):
                st.session_state.dictation_input = user_input
                st.session_state.learn_phase = "result"
                st.session_state.hint_word = None
                st.rerun()
        with col2:
            if st.button("✅ 학습완료", use_container_width=True, key="learn_done_hidden"):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {"completed": True}
                st.session_state.current_idx += 1
                st.session_state.learn_phase = "reading"
                st.session_state.hint_word = None
                st.rerun()

    elif phase == "result":
        # --- Phase 3: typing comparison ---
        user_input = st.session_state.dictation_input
        result = compute_word_match(user_input, verse_text)

        score = result["score"]
        score_class = "score-good" if score >= 80 else "score-ok" if score >= 50 else "score-bad"

        st.markdown(
            f'<div class="{score_class} score-display">{score}%</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f"**{result['matched_words']}** / {result['total_words']} 단어 일치",
        )

        comparison_html = render_word_comparison(result)
        st.markdown(
            f'<div class="dictation-result">{comparison_html}</div>',
            unsafe_allow_html=True,
        )

        st.markdown("**정답:**")
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True,
        )

        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("🔄 다시 연습", use_container_width=True):
                st.session_state.learn_phase = "hidden"
                st.session_state.dictation_input = ""
                st.rerun()
        with col2:
            if st.button("👀 다시 읽기", use_container_width=True):
                st.session_state.learn_phase = "reading"
                st.session_state.dictation_input = ""
                st.rerun()
        with col3:
            if st.button("✅ 학습완료", type="primary", use_container_width=True, key="learn_done_result"):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {"completed": True}
                st.session_state.current_idx += 1
                st.session_state.learn_phase = "reading"
                st.session_state.dictation_input = ""
                st.session_state.hint_word = None
                st.rerun()


def render_recitation_mode(verse_text: str, order: list, idx: int):
    """Render the recitation (암송) mode card."""
    font_size = get_font_size()

    if st.session_state.show_verse:
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True
        )
    else:
        if st.session_state.hint_word is not None:
            st.markdown(
                f'<div class="hint-display">💡 {st.session_state.hint_word}</div>',
                unsafe_allow_html=True
            )
        else:
            st.markdown(
                '<div class="verse-hidden">👇 아래 버튼을 눌러 구절을 확인하세요</div>',
                unsafe_allow_html=True
            )
        hint_col, show_col = st.columns([1, 2])
        with hint_col:
            if st.button("💡 랜덤 힌트", use_container_width=True):
                words = [w for w in verse_text.split() if w]
                st.session_state.hint_word = random.choice(words) if words else ""
                st.rerun()
        with show_col:
            if st.button("구절 확인", type="primary", use_container_width=True):
                st.session_state.show_verse = True
                st.session_state.hint_word = None
                st.rerun()

    if st.session_state.show_verse:
        has_history = len(st.session_state.history) > 0
        if has_history:
            col_prev, col1, col2, col3 = st.columns(4)
        else:
            col_prev = None
            col1, col2, col3 = st.columns(3)

        if has_history:
            with col_prev:
                if st.button("⬅️ 이전", use_container_width=True):
                    go_previous()
                    st.rerun()

        with col1:
            if st.button("⏭️ 건너뛰기", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.skipped.add(order[idx])
                st.session_state.current_idx += 1
                st.session_state.show_verse = False
                st.session_state.hint_word = None
                st.rerun()

        with col2:
            if st.button("🔄 다시보기", use_container_width=True):
                st.session_state.show_verse = False
                st.session_state.hint_word = None
                st.rerun()

        with col3:
            if st.button("✅ 암기완료", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {"completed": True}
                st.session_state.current_idx += 1
                st.session_state.show_verse = False
                st.session_state.hint_word = None
                st.rerun()
    else:
        if len(st.session_state.history) > 0:
            if st.button("⬅️ 이전", use_container_width=True):
                go_previous()
                st.rerun()


def render_dictation_mode(verse_text: str, order: list, idx: int, location: str):
    """Render the dictation (받아쓰기) mode card."""
    font_size = get_font_size()

    if st.session_state.get("hint_word") is not None:
        st.markdown(
            f'<div class="hint-display">💡 {st.session_state.hint_word}</div>',
            unsafe_allow_html=True
        )
    else:
        st.markdown(
            '<div class="verse-hidden">✍️ 아래에 기억나는 구절을 입력하세요</div>',
            unsafe_allow_html=True
        )

    current_card_key = f"dictation_{order[idx]}"

    if not st.session_state.dictation_submitted:
        user_input = st.text_area(
            "구절을 입력하세요",
            key=current_card_key,
            height=150,
            placeholder="기억나는 대로 구절을 입력하세요..."
        )

        if st.button("💡 랜덤 힌트", use_container_width=True):
            words = [w for w in verse_text.split() if w]
            st.session_state.hint_word = random.choice(words) if words else ""
            st.rerun()

        has_history = len(st.session_state.history) > 0
        if has_history:
            bcol1, bcol2, bcol3 = st.columns(3)
        else:
            bcol1, bcol2 = st.columns([1, 1])

        if has_history:
            with bcol1:
                if st.button("⬅️ 이전", use_container_width=True):
                    go_previous()
                    st.rerun()

        skip_col = bcol2 if has_history else bcol1
        submit_col = bcol3 if has_history else bcol2

        with skip_col:
            if st.button("⏭️ 건너뛰기", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.skipped.add(order[idx])
                st.session_state.current_idx += 1
                st.session_state.dictation_submitted = False
                st.session_state.hint_word = None
                st.rerun()

        with submit_col:
            if st.button("제출", type="primary", use_container_width=True):
                st.session_state.dictation_input = user_input
                st.session_state.dictation_submitted = True
                st.session_state.hint_word = None
                st.rerun()

    else:
        user_input = st.session_state.dictation_input
        result = compute_word_match(user_input, verse_text)

        score = result["score"]
        score_class = "score-good" if score >= 80 else "score-ok" if score >= 50 else "score-bad"

        st.markdown(
            f'<div class="{score_class} score-display">{score}%</div>',
            unsafe_allow_html=True
        )
        st.markdown(
            f"**{result['matched_words']}** / {result['total_words']} 단어 일치",
        )

        comparison_html = render_word_comparison(result)
        st.markdown(
            f'<div class="dictation-result">{comparison_html}</div>',
            unsafe_allow_html=True
        )

        st.markdown("**정답:**")
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True
        )

        has_history = len(st.session_state.history) > 0
        if has_history:
            col_prev, col1, col2 = st.columns(3)
        else:
            col1, col2 = st.columns(2)

        if has_history:
            with col_prev:
                if st.button("⬅️ 이전", use_container_width=True):
                    go_previous()
                    st.rerun()

        with col1:
            if st.button("🔄 다시 도전", use_container_width=True):
                st.session_state.dictation_submitted = False
                st.session_state.dictation_input = ""
                st.rerun()

        with col2:
            if st.button("➡️ 다음", type="primary", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {
                    "score": result["score"],
                    "matched": result["matched_words"],
                    "total": result["total_words"],
                }
                st.session_state.current_idx += 1
                st.session_state.dictation_submitted = False
                st.session_state.dictation_input = ""
                st.rerun()


def go_previous():
    """Go back to the previous card."""
    if not st.session_state.history:
        return

    prev_card = st.session_state.history.pop()
    st.session_state.completed.discard(prev_card)
    st.session_state.skipped.discard(prev_card)
    if prev_card in st.session_state.mode_results:
        del st.session_state.mode_results[prev_card]

    order = st.session_state.order
    try:
        prev_pos = order.index(prev_card)
        st.session_state.current_idx = prev_pos
    except ValueError:
        st.session_state.order.insert(st.session_state.current_idx, prev_card)
        st.session_state.current_idx = st.session_state.current_idx

    st.session_state.show_verse = False
    st.session_state.dictation_submitted = False
    st.session_state.dictation_input = ""
    st.session_state.hint_word = None
    st.session_state.learn_phase = "reading"


# ============================================================
# Theme 2: 단어 순서 외우기
# ============================================================

# 성경 각 권별 이모지
BIBLE_BOOK_EMOJIS = {
    # 구약 39권
    "창세기": "🌍", "출애굽기": "🔥", "레위기": "🐑", "민수기": "🏕️",
    "신명기": "📜", "여호수아": "⚔️", "사사기": "🛡️", "룻기": "🌾",
    "사무엘상": "👑", "사무엘하": "🏰", "열왕기상": "🏛️", "열왕기하": "💥",
    "역대상": "📋", "역대하": "🏗️", "에스라": "🔨", "느헤미야": "🧱",
    "에스더": "👸", "욥기": "😰", "시편": "🎵", "잠언": "💎",
    "전도서": "🌬️", "아가": "💕", "이사야": "🕊️", "예레미야": "😢",
    "예레미야애가": "💔", "에스겔": "👁️", "다니엘": "🦁", "호세아": "💍",
    "요엘": "🦗", "아모스": "📢", "오바댜": "⛰️", "요나": "🐋",
    "미가": "⭐", "나훔": "🌊", "하박국": "❓", "스바냐": "⚡",
    "학개": "⛏️", "스가랴": "🐴", "말라기": "✉️",
    # 신약 27권
    "마태복음": "📖", "마가복음": "🏃", "누가복음": "🩺", "요한복음": "🕯️",
    "사도행전": "🗺️", "로마서": "⚖️", "고린도전서": "💌", "고린도후서": "💪",
    "갈라디아서": "⛓️", "에베소서": "🏠", "빌립보서": "😊", "골로새서": "🌟",
    "데살로니가전서": "☁️", "데살로니가후서": "⏳", "디모데전서": "🧑‍🏫", "디모데후서": "🏅",
    "디도서": "🏝️", "빌레몬서": "🤝", "히브리서": "🙏", "야고보서": "🔧",
    "베드로전서": "🪨", "베드로후서": "⚠️", "요한1서": "❤️", "요한2서": "🚶",
    "요한3서": "🤗", "유다서": "🗡️", "요한계시록": "📯",
}

# 성경 각 권별 내용 기반 힌트 (대표적인 내용 요약)
BIBLE_BOOK_HINTS = {
    # 구약 39권
    "창세기": "천지창조와 아브라함·이삭·야곱의 이야기",
    "출애굽기": "모세가 이스라엘 백성을 이집트에서 이끌어 냄",
    "레위기": "제사 제도와 정결 율법의 규례",
    "민수기": "광야 40년의 여정과 인구조사",
    "신명기": "가나안 입성 전 모세의 마지막 설교",
    "여호수아": "가나안 땅 정복과 12지파에게 분배",
    "사사기": "기드온·삼손 등 사사들의 시대",
    "룻기": "모압 여인의 시어머니를 향한 충성",
    "사무엘상": "사울왕 즉위와 목동 다윗의 등장",
    "사무엘하": "다윗 왕의 통치와 시련",
    "열왕기상": "솔로몬의 성전 건축과 왕국 분열",
    "열왕기하": "엘리야·엘리사 이후 남북 왕국의 멸망",
    "역대상": "다윗의 족보와 통치 기록",
    "역대하": "솔로몬의 성전 건축부터 유다 왕들의 역사",
    "에스라": "바벨론 포로 귀환과 성전 재건",
    "느헤미야": "예루살렘 성벽 재건의 이야기",
    "에스더": "유대 민족을 구한 페르시아의 왕비",
    "욥기": "의로운 자가 겪는 고난과 인내의 이야기",
    "시편": "다윗 등의 찬양과 기도의 시 모음",
    "잠언": "솔로몬의 지혜로운 교훈 모음",
    "전도서": "헛되고 헛되도다, 인생의 의미를 묻다",
    "아가": "신랑과 신부의 아름다운 사랑 노래",
    "이사야": "메시아 예언과 이스라엘을 향한 위로",
    "예레미야": "눈물의 선지자가 전하는 심판 경고",
    "예레미야애가": "예루살렘 멸망을 슬퍼하는 애가",
    "에스겔": "마른 뼈가 살아나는 환상과 새 성전",
    "다니엘": "사자굴의 믿음과 종말의 환상",
    "호세아": "불신실한 아내를 향한 변치 않는 사랑",
    "요엘": "메뚜기 재앙과 성령 부어주심의 약속",
    "아모스": "목자 출신이 외치는 공의와 정의",
    "오바댜": "에돔에 대한 심판 선포",
    "요나": "큰 물고기 뱃속과 니느웨의 회개",
    "미가": "베들레헴에서 오실 통치자 예언",
    "나훔": "앗수르 수도 니느웨의 멸망 예언",
    "하박국": "의인은 믿음으로 살리라",
    "스바냐": "여호와의 크고 두려운 심판의 날",
    "학개": "귀환 후 성전 재건을 촉구하다",
    "스가랴": "여덟 가지 환상과 메시아 예언",
    "말라기": "구약의 마지막, 엘리야의 오심 예언",
    # 신약 27권
    "마태복음": "유대인을 위해 기록된 왕이신 예수",
    "마가복음": "행동하시는 종 예수의 간결한 복음",
    "누가복음": "의사 누가가 기록한 인자이신 예수",
    "요한복음": "세상의 빛, 하나님의 아들 예수",
    "사도행전": "성령 강림과 초대교회 복음 전파",
    "로마서": "이신칭의, 믿음으로 의롭게 됨",
    "고린도전서": "교회 문제 해결과 사랑의 장(13장)",
    "고린도후서": "약함 속의 강함, 사도 바울의 권위",
    "갈라디아서": "율법에서 자유, 오직 믿음으로",
    "에베소서": "그리스도 안에서 하나 된 교회",
    "빌립보서": "어떤 상황에서도 기뻐하라",
    "골로새서": "만물 위에 으뜸이 되시는 그리스도",
    "데살로니가전서": "예수님 재림의 소망",
    "데살로니가후서": "재림 전에 나타날 징조들",
    "디모데전서": "젊은 목회자 디모데에게 주는 교훈",
    "디모데후서": "선한 싸움을 싸우라, 바울의 유언",
    "디도서": "그레데 섬 교회 조직과 교훈",
    "빌레몬서": "도망 노예 오네시모를 위한 사랑의 편지",
    "히브리서": "예수는 영원한 대제사장",
    "야고보서": "행함이 없는 믿음은 죽은 것",
    "베드로전서": "고난 중에도 소망을 품으라",
    "베드로후서": "거짓 교사를 경계하라",
    "요한1서": "하나님은 사랑이시라",
    "요한2서": "진리 안에서 행하라",
    "요한3서": "선을 행하는 자는 하나님께 속한 자",
    "유다서": "믿음의 도를 위하여 힘써 싸우라",
    "요한계시록": "종말의 환상과 새 하늘 새 땅",
}


def get_book_emoji(word: str) -> str:
    """성경 권명에 해당하는 이모지를 반환"""
    return BIBLE_BOOK_EMOJIS.get(word, "")


def get_chosung(text: str) -> str:
    """한글 문자열의 첫 글자 초성을 반환"""
    CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ',
               'ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
    char = text[0]
    if '가' <= char <= '힣':
        code = ord(char) - ord('가')
        return CHOSUNG[code // 588]
    return char


def get_hint_text(word: str, level: int) -> str:
    """힌트 텍스트 생성 (level 1: 성경 내용 힌트, level 2: 내용 + 초성 + 글자 수)"""
    content_hint = BIBLE_BOOK_HINTS.get(word, "")
    ch = get_chosung(word)
    emoji = BIBLE_BOOK_EMOJIS.get(word, "💡")
    if level == 1:
        if content_hint:
            return f"{emoji} 힌트: {content_hint}"
        return f"💡 다음 단어는 '{ch}'으로 시작합니다"
    if content_hint:
        return f"⚠️ 마지막 기회! {content_hint} ('{ch}'으로 시작하는 {len(word)}글자)"
    return f"⚠️ 마지막 기회! '{ch}'으로 시작하는 {len(word)}글자입니다"


def get_ordering_files() -> list[tuple[str, str]]:
    """data/ 폴더에서 bible_books_*.csv 파일 목록 반환"""
    if not os.path.isdir(DATA_DIR):
        return []
    results = []
    for f in sorted(os.listdir(DATA_DIR)):
        if f.startswith("bible_books_") and f.endswith(".csv"):
            results.append(f)
    return results


def load_ordering_csv(file_path: str) -> list[str]:
    """순서 외우기용 CSV 로드. order 컬럼 기준 정렬 후 name_ko 리스트 반환"""
    df = pd.read_csv(file_path)
    df = df.sort_values("order").reset_index(drop=True)
    return df["name_ko"].tolist()


def load_ordering_csv_from_upload(uploaded_file) -> list[str]:
    """업로드된 CSV에서 단어 목록 로드 (utf-8, cp949 대응)"""
    import io
    raw = uploaded_file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp949")
    df = pd.read_csv(io.StringIO(text))
    required = {"order", "name_ko", "name_en"}
    if not required.issubset(set(df.columns)):
        return None
    df = df.sort_values("order").reset_index(drop=True)
    return df["name_ko"].tolist()


def reset_ordering_state():
    """테마 2 session_state 초기화"""
    keys = [k for k in st.session_state.keys() if k.startswith("ord_")]
    for k in keys:
        del st.session_state[k]


def render_bgm_player(is_playing: bool):
    """Web Audio API 기반 BGM 재생/정지"""
    if is_playing:
        components.html("""
        <div id="bgm-container"></div>
        <script>
        (function() {
            if (window._bgmPlaying) return;
            window._bgmPlaying = true;

            const ctx = new (window.AudioContext || window.webkitAudioContext)();

            const melody = [
                [261.63, 0.4], [329.63, 0.4], [392.00, 0.4], [523.25, 0.6],
                [392.00, 0.4], [329.63, 0.4], [261.63, 0.6],
                [293.66, 0.4], [349.23, 0.4], [440.00, 0.4], [523.25, 0.6],
                [440.00, 0.4], [349.23, 0.4], [293.66, 0.6],
            ];
            let noteIndex = 0;

            function playNote() {
                if (!window._bgmPlaying) return;

                const [freq, dur] = melody[noteIndex % melody.length];
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + dur);

                noteIndex++;
                setTimeout(playNote, dur * 1000);
            }

            playNote();
        })();
        </script>
        """, height=0)
    else:
        components.html("""
        <script>
        window._bgmPlaying = false;
        </script>
        """, height=0)


def render_theme_selection():
    """앱 최초 진입 시 테마 카드 2개를 표시"""
    st.markdown("""
    <style>
    .theme-card {
        border: 2px solid #e2e8f0;
        border-radius: 16px;
        padding: 30px 20px;
        text-align: center;
        background: #ffffff;
        min-height: 200px;
    }
    .theme-card h3 { margin-top: 10px; }
    .theme-card p { color: #64748b; font-size: 14px; }
    </style>
    """, unsafe_allow_html=True)

    st.markdown("<h1 style='text-align:center;'>📖 B-Anki</h1>", unsafe_allow_html=True)
    st.markdown("<p style='text-align:center; color:#64748b; font-size:18px;'>성경 암기 훈련 도우미</p>", unsafe_allow_html=True)
    st.markdown("")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("""
        <div class="theme-card">
            <div style="font-size:48px;">📜</div>
            <h3>테마 1</h3>
            <h4>성경구절 암기</h4>
            <p>구절을 보고 학습/테스트하는 플래시카드</p>
        </div>
        """, unsafe_allow_html=True)
        if st.button("📜 성경구절 암기", use_container_width=True, type="primary"):
            st.session_state.selected_theme = "verse"
            st.rerun()

    with col2:
        st.markdown("""
        <div class="theme-card">
            <div style="font-size:48px;">🔢</div>
            <h3>테마 2</h3>
            <h4>단어순서 외우기</h4>
            <p>성경 책 이름의 순서를 맞추는 게임</p>
        </div>
        """, unsafe_allow_html=True)
        if st.button("🔢 단어순서 외우기", use_container_width=True, type="primary"):
            st.session_state.selected_theme = "ordering"
            st.rerun()


def render_ordering_setup():
    """단어 순서 외우기 설정 화면"""
    st.markdown("### 🔢 단어 순서 외우기")
    st.markdown("---")

    user_name = st.text_input("닉네임 (선택사항)", placeholder="닉네임을 입력하세요", key="ord_name_input")

    st.markdown("**데이터 선택**")
    data_source = st.radio("데이터 소스", ["기본 데이터셋", "CSV 파일 업로드"],
                           horizontal=True, label_visibility="collapsed")

    word_list = None
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
        combined = []
        for f in files:
            path = os.path.join(DATA_DIR, f)
            if os.path.exists(path):
                combined.extend(load_ordering_csv(path))
        if combined:
            word_list = combined
    else:
        uploaded = st.file_uploader("CSV 파일 업로드 (order, name_ko, name_en)", type=["csv"])
        if uploaded:
            result = load_ordering_csv_from_upload(uploaded)
            if result is None:
                st.error("CSV에 order, name_ko, name_en 컬럼이 필요합니다.")
            else:
                word_list = result
                dataset_name = uploaded.name

    st.markdown("**게임 모드**")
    game_mode = st.radio("모드", ["🖱️ 클릭 배열 - 순서대로 클릭하여 배열",
                                   "✍️ 받아쓰기 - 순서대로 직접 입력"],
                         label_visibility="collapsed")

    max_wrong = st.number_input("허용 오답 수", min_value=1, max_value=10, value=3)

    bgm_on = st.toggle("🎵 배경음악", value=False)

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🎮 게임 시작", type="primary", use_container_width=True):
            if word_list is None or len(word_list) == 0:
                st.error("데이터를 선택해주세요.")
            else:
                st.session_state.ord_game_started = True
                st.session_state.ord_username = user_name.strip()
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
                st.session_state.ord_bgm_on = bgm_on
                st.session_state.ord_show_hint = False
                st.session_state.ord_dataset_name = dataset_name
                st.session_state.ord_last_feedback = None
                st.session_state.ord_typing_key = 0
                st.rerun()
    with col2:
        if st.button("🏠 돌아가기", use_container_width=True):
            st.session_state.selected_theme = None
            st.rerun()


def render_ordering_game():
    """게임 메인 분기"""
    if st.session_state.get("ord_game_clear", False):
        render_ordering_certificate()
        return
    if st.session_state.get("ord_game_over", False):
        render_ordering_game_over()
        return

    # BGM
    if st.session_state.get("ord_bgm_on", False):
        render_bgm_player(True)

    if st.session_state.ord_mode == "클릭 배열":
        render_click_mode()
    else:
        render_typing_mode()


def _render_ordering_header():
    """게임 공통 헤더 (제목, 하트, 진행률, BGM 토글, 처음으로)"""
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
        st.markdown(f"### 🔢 단어 순서 외우기")
        st.caption(f"📊 {dataset_name} | {mode_label}")
    with hcol2:
        bgm_val = st.toggle("🎵 BGM", value=st.session_state.get("ord_bgm_on", False), key="bgm_toggle_game")
        if bgm_val != st.session_state.get("ord_bgm_on", False):
            st.session_state.ord_bgm_on = bgm_val
            if not bgm_val:
                render_bgm_player(False)
            st.rerun()
        if st.button("🏠 처음으로", use_container_width=True, key="home_btn"):
            reset_ordering_state()
            st.session_state.selected_theme = None
            st.rerun()

    # Hearts
    hearts = "❤️" * remaining + "🖤" * wrong_count
    st.markdown(f'<div style="font-size:24px; text-align:center;">{hearts} (남은 기회: {remaining}/{max_wrong})</div>', unsafe_allow_html=True)

    # Progress
    st.progress(current / total if total else 0)
    st.caption(f"진행률: {current} / {total}")


def render_click_mode():
    """클릭 배열 모드"""
    _render_ordering_header()

    word_list = st.session_state.ord_word_list
    total = len(word_list)
    current = st.session_state.ord_current_index
    max_wrong = st.session_state.ord_max_wrong
    wrong_count = st.session_state.ord_wrong_count
    remaining = max_wrong - wrong_count

    # Feedback from last action
    feedback = st.session_state.get("ord_last_feedback")
    if feedback:
        if feedback["type"] == "success":
            st.success(feedback["msg"])
        else:
            st.error(feedback["msg"])
        st.session_state.ord_last_feedback = None

    # Auto-hint when remaining == 1
    if remaining == 1 and current < total:
        hint_text = get_hint_text(word_list[current], 2)
        st.warning(hint_text)

    st.markdown("---")

    # Button grid - show remaining words in shuffled order
    chosen_set = set(range(current))  # indices already answered
    remaining_indices = [i for i in st.session_state.ord_shuffled_indices if i not in chosen_set]

    cols_per_row = 4
    rows = [remaining_indices[i:i+cols_per_row] for i in range(0, len(remaining_indices), cols_per_row)]

    for row in rows:
        cols = st.columns(cols_per_row)
        for j, word_idx in enumerate(row):
            with cols[j]:
                word = word_list[word_idx]
                emoji = get_book_emoji(word)
                btn_label = f"{emoji} {word}" if emoji else word
                # Highlight when auto-hint and this is the correct answer
                btn_type = "primary" if (remaining == 1 and word_idx == current) else "secondary"
                if st.button(btn_label, key=f"word_btn_{word_idx}_{current}", use_container_width=True, type=btn_type):
                    if word_idx == current:
                        st.session_state.ord_correct_answers.append(word)
                        st.session_state.ord_current_index += 1
                        st.session_state.ord_show_hint = False
                        if st.session_state.ord_current_index >= total:
                            st.session_state.ord_game_clear = True
                        st.session_state.ord_last_feedback = {"type": "success", "msg": f"✅ 정답! {current+1}.{get_book_emoji(word)} {word}"}
                        st.rerun()
                    else:
                        st.session_state.ord_wrong_count += 1
                        if st.session_state.ord_wrong_count >= max_wrong:
                            st.session_state.ord_game_over = True
                        st.session_state.ord_last_feedback = {"type": "error", "msg": f"❌ 틀렸습니다! '{get_book_emoji(word)} {word}'는 {current+1}번이 아닙니다"}
                        st.rerun()

    # Answer chain
    st.markdown("---")
    if st.session_state.ord_correct_answers:
        chain = " → ".join([f"{i+1}.{get_book_emoji(w)} {w}" for i, w in enumerate(st.session_state.ord_correct_answers)])
        st.markdown(f"""<div style="font-size:16px; line-height:2; padding:15px; background:#f0fdf4;
            border-radius:12px; border-left:4px solid #22c55e; margin:10px 0;">
            ✅ 정답 배열:<br>{chain}</div>""", unsafe_allow_html=True)

    # Hint button
    if current < total:
        if st.button("💡 힌트 보기", use_container_width=True):
            st.session_state.ord_show_hint = True
            st.rerun()
        if st.session_state.get("ord_show_hint", False):
            st.info(get_hint_text(word_list[current], 1))


def render_typing_mode():
    """받아쓰기 모드"""
    _render_ordering_header()

    word_list = st.session_state.ord_word_list
    total = len(word_list)
    current = st.session_state.ord_current_index
    max_wrong = st.session_state.ord_max_wrong
    wrong_count = st.session_state.ord_wrong_count
    remaining = max_wrong - wrong_count

    # Feedback
    feedback = st.session_state.get("ord_last_feedback")
    if feedback:
        if feedback["type"] == "success":
            st.success(feedback["msg"])
        else:
            st.error(feedback["msg"])
        st.session_state.ord_last_feedback = None

    # Auto-hint
    if remaining == 1 and current < total:
        st.warning(get_hint_text(word_list[current], 2))

    st.markdown("---")

    # Show correct answers so far
    if st.session_state.ord_correct_answers:
        chain = " → ".join([f"{i+1}.{get_book_emoji(w)} {w}" for i, w in enumerate(st.session_state.ord_correct_answers)])
        st.markdown(f"""<div style="font-size:16px; line-height:2; padding:15px; background:#f0fdf4;
            border-radius:12px; border-left:4px solid #22c55e; margin:10px 0;">
            ✅ 지금까지 맞춘 단어:<br>{chain}</div>""", unsafe_allow_html=True)

    if current < total:
        st.markdown(f"**📝 {current+1}번째 단어를 입력하세요:**")
        typing_key = st.session_state.get("ord_typing_key", 0)
        user_input = st.text_input("단어 입력", key=f"ord_typing_{typing_key}", label_visibility="collapsed",
                                   placeholder="단어를 입력하세요...")

        col1, col2 = st.columns([2, 1])
        with col1:
            if st.button("확인", type="primary", use_container_width=True) or False:
                answer = word_list[current]
                if user_input.strip() == answer:
                    st.session_state.ord_correct_answers.append(answer)
                    st.session_state.ord_current_index += 1
                    st.session_state.ord_show_hint = False
                    st.session_state.ord_typing_key = typing_key + 1
                    if st.session_state.ord_current_index >= total:
                        st.session_state.ord_game_clear = True
                    st.session_state.ord_last_feedback = {"type": "success", "msg": f"✅ 정답! {current+1}.{get_book_emoji(answer)} {answer}"}
                    st.rerun()
                elif user_input.strip():
                    st.session_state.ord_wrong_count += 1
                    st.session_state.ord_typing_key = typing_key + 1
                    if st.session_state.ord_wrong_count >= max_wrong:
                        st.session_state.ord_game_over = True
                    st.session_state.ord_last_feedback = {"type": "error", "msg": "❌ 틀렸습니다!"}
                    st.rerun()
        with col2:
            if st.button("💡 힌트 보기", use_container_width=True, key="hint_typing"):
                st.session_state.ord_show_hint = True
                st.rerun()

        if st.session_state.get("ord_show_hint", False):
            st.info(get_hint_text(word_list[current], 1))


def render_ordering_game_over():
    """게임 오버 화면"""
    st.markdown("<h2 style='text-align:center;'>😢 게임 오버</h2>", unsafe_allow_html=True)

    word_list = st.session_state.ord_word_list
    total = len(word_list)
    matched = len(st.session_state.ord_correct_answers)

    st.markdown(f"<p style='text-align:center; font-size:20px;'>{matched} / {total} 단어까지 맞췄습니다</p>", unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("**📋 전체 정답 목록:**")
    items = [f"{i+1}.{get_book_emoji(w)} {w}" for i, w in enumerate(word_list)]
    # Display in rows of 5
    for i in range(0, len(items), 5):
        st.markdown("  ".join(items[i:i+5]))

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 다시 도전하기", type="primary", use_container_width=True):
            word_list_saved = st.session_state.ord_word_list
            mode = st.session_state.ord_mode
            max_wrong = st.session_state.ord_max_wrong
            username = st.session_state.ord_username
            bgm = st.session_state.ord_bgm_on
            dataset = st.session_state.ord_dataset_name
            reset_ordering_state()
            st.session_state.selected_theme = "ordering"
            st.session_state.ord_game_started = True
            st.session_state.ord_username = username
            st.session_state.ord_mode = mode
            st.session_state.ord_max_wrong = max_wrong
            st.session_state.ord_wrong_count = 0
            st.session_state.ord_current_index = 0
            st.session_state.ord_correct_answers = []
            st.session_state.ord_word_list = word_list_saved
            shuffled = list(range(len(word_list_saved)))
            random.shuffle(shuffled)
            st.session_state.ord_shuffled_indices = shuffled
            st.session_state.ord_start_time = time.time()
            st.session_state.ord_game_over = False
            st.session_state.ord_game_clear = False
            st.session_state.ord_bgm_on = bgm
            st.session_state.ord_show_hint = False
            st.session_state.ord_dataset_name = dataset
            st.session_state.ord_last_feedback = None
            st.session_state.ord_typing_key = 0
            st.rerun()
    with col2:
        if st.button("🏠 처음으로", use_container_width=True, key="home_gameover"):
            reset_ordering_state()
            st.session_state.selected_theme = None
            st.rerun()


def render_ordering_certificate():
    """게임 클리어 인증서 화면"""
    st.balloons()

    elapsed = time.time() - st.session_state.ord_start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    time_str = f"{minutes}분 {seconds}초"

    wrong_count = st.session_state.ord_wrong_count
    name = st.session_state.ord_username if st.session_state.ord_username else "익명의 도전자"
    dataset = st.session_state.ord_dataset_name
    mode = st.session_state.ord_mode

    if wrong_count == 0:
        comment = "완벽합니다! 🏆"
    elif wrong_count <= 2:
        comment = "훌륭합니다! 거의 완벽한 암기력! ⭐"
    else:
        comment = "수고하셨습니다! 다음엔 더 잘할 수 있어요! 💪"

    html = (
        '<div style="'
        'border: 4px double #d4af37;'
        'border-radius: 20px;'
        'padding: 40px 30px;'
        'margin: 20px auto;'
        'max-width: 600px;'
        'text-align: center;'
        'background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%);'
        'box-shadow: 0 4px 20px rgba(0,0,0,0.1);'
        '">'
        '<div style="font-size:48px; margin-bottom:10px;">✨</div>'
        '<h1 style="font-family: Georgia, serif; color: #92400e; font-size: 28px; margin-bottom: 5px;">단어 순서 암기 인증서</h1>'
        '<hr style="border:1px solid #d4af37; margin: 15px 40px;">'
        f'<p style="font-size:28px; font-weight:bold; color:#1e3a5f; margin:20px 0;">{name}</p>'
        f'<p style="font-size:16px; color:#555;">과목: <b>{dataset}</b></p>'
        f'<p style="font-size:16px; color:#555;">모드: <b>{mode}</b></p>'
        f'<p style="font-size:16px; color:#555;">소요 시간: <b>{time_str}</b></p>'
        f'<p style="font-size:16px; color:#555;">틀린 횟수: <b>{wrong_count}회</b></p>'
        f'<p style="font-size:16px; color:#555;">날짜: <b>{time.strftime("%Y-%m-%d")}</b></p>'
        '<hr style="border:1px solid #d4af37; margin: 15px 40px;">'
        f'<p style="font-size:18px; color:#92400e; font-weight:bold; margin:15px 0;">{comment}</p>'
        '</div>'
    )
    st.markdown(html, unsafe_allow_html=True)

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🔄 다시 도전하기", type="primary", use_container_width=True, key="retry_clear"):
            word_list_saved = st.session_state.ord_word_list
            mode = st.session_state.ord_mode
            max_wrong = st.session_state.ord_max_wrong
            username = st.session_state.ord_username
            bgm = st.session_state.ord_bgm_on
            dataset = st.session_state.ord_dataset_name
            reset_ordering_state()
            st.session_state.selected_theme = "ordering"
            st.session_state.ord_game_started = True
            st.session_state.ord_username = username
            st.session_state.ord_mode = mode
            st.session_state.ord_max_wrong = max_wrong
            st.session_state.ord_wrong_count = 0
            st.session_state.ord_current_index = 0
            st.session_state.ord_correct_answers = []
            st.session_state.ord_word_list = word_list_saved
            shuffled = list(range(len(word_list_saved)))
            random.shuffle(shuffled)
            st.session_state.ord_shuffled_indices = shuffled
            st.session_state.ord_start_time = time.time()
            st.session_state.ord_game_over = False
            st.session_state.ord_game_clear = False
            st.session_state.ord_bgm_on = bgm
            st.session_state.ord_show_hint = False
            st.session_state.ord_dataset_name = dataset
            st.session_state.ord_last_feedback = None
            st.session_state.ord_typing_key = 0
            st.rerun()
    with col2:
        if st.button("🏠 처음으로", use_container_width=True, key="home_clear"):
            reset_ordering_state()
            st.session_state.selected_theme = None
            st.rerun()


if __name__ == "__main__":
    main()
