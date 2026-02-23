import streamlit as st
import pandas as pd
import random
import os

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
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".csv")]
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

    st.markdown(f"""
    <div style="
        border: 4px double #d4af37;
        border-radius: 20px;
        padding: 40px 30px;
        margin: 20px auto;
        max-width: 600px;
        text-align: center;
        background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%);
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    ">
        <div style="font-size:48px; margin-bottom:10px;">🏆</div>
        <h1 style="
            font-family: 'Georgia', serif;
            color: #92400e;
            font-size: 32px;
            margin-bottom: 5px;
        ">수 료 증</h1>
        <p style="color:#b45309; font-size:14px; margin-bottom:25px;">KPCCW 2026 성경암송</p>
        <hr style="border:1px solid #d4af37; margin: 15px 40px;">
        <p style="font-size:28px; font-weight:bold; color:#1e3a5f; margin:20px 0;">
            {name_display}
        </p>
        <p style="font-size:16px; color:#555; margin:10px 0;">
            위 사람은 성경 암송 {total}구절을 모두 마쳤음을 증명합니다.
        </p>
        {"<p style='font-size:20px; color:#333; margin:15px 0;'>평균 정확도: <b>" + str(avg_score) + "%</b> (등급: <b>" + grade + "</b>)</p>" if has_dictation else ""}
        <hr style="border:1px solid #d4af37; margin: 15px 40px;">
        <p style="font-size:14px; color:#888;">
            축하합니다! 하나님의 말씀을 마음에 새기는 귀한 시간이었습니다.
        </p>
        <p style="font-size:12px; color:#aaa; margin-top:15px;">B-Anki 성경 암기</p>
    </div>
    """, unsafe_allow_html=True)

    if has_dictation:
        with st.expander("구절별 상세 결과 보기"):
            for idx_key, res in results.items():
                if "score" in res:
                    row = df.iloc[idx_key]
                    icon = "✅" if res["score"] >= 80 else "⚠️" if res["score"] >= 50 else "❌"
                    st.markdown(f"{icon} **{row['location']}** — {res['score']}%")


def main():
    st.set_page_config(page_title="B-Anki 성경 암기", page_icon="📖", layout="centered")

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
        div[data-testid="stMainBlockContainer"] {{
            max-width: 800px;
        }}
    </style>
    """, unsafe_allow_html=True)

    st.title("📖 B-Anki 성경 암기")

    # --- Setup phase ---
    if "setup_done" not in st.session_state:
        st.session_state.setup_done = False

    if not st.session_state.setup_done:
        render_setup_page()
        return

    render_main_page()


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

    mode = st.radio("학습 모드", ["암송", "받아쓰기"],
                    captions=["구절을 보며 암기합니다", "직접 타이핑하여 정확도를 확인합니다"],
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
        st.session_state.mode = mode
        st.session_state.user_name = user_name.strip()
        st.session_state.shuffle = shuffle
        st.rerun()


def render_main_page():
    """Render the main learning page."""
    selected_file = st.session_state.loaded_file
    verse_col = st.session_state.verse_col
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
    st.caption(f"진행: {completed_count} / {total}  |  모드: {mode}")

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

    if mode == "암송":
        render_recitation_mode(verse_text, order, idx)
    else:
        render_dictation_mode(verse_text, order, idx, location)


def render_recitation_mode(verse_text: str, order: list, idx: int):
    """Render the recitation (암송) mode card."""
    font_size = get_font_size()

    if st.session_state.show_verse:
        st.markdown(
            f'<div class="verse-text">{verse_text}</div>',
            unsafe_allow_html=True
        )
    else:
        st.markdown(
            '<div class="verse-hidden">👆 아래 버튼을 눌러 구절을 확인하세요</div>',
            unsafe_allow_html=True
        )
        if st.button("구절 확인", type="primary", use_container_width=True):
            st.session_state.show_verse = True
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
                st.rerun()

        with col2:
            if st.button("🔄 다시보기", use_container_width=True):
                st.session_state.show_verse = False
                st.rerun()

        with col3:
            if st.button("✅ 암기완료", use_container_width=True):
                st.session_state.history.append(order[idx])
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.mode_results[order[idx]] = {"completed": True}
                st.session_state.current_idx += 1
                st.session_state.show_verse = False
                st.rerun()
    else:
        if len(st.session_state.history) > 0:
            if st.button("⬅️ 이전", use_container_width=True):
                go_previous()
                st.rerun()


def render_dictation_mode(verse_text: str, order: list, idx: int, location: str):
    """Render the dictation (받아쓰기) mode card."""
    font_size = get_font_size()

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
                st.rerun()

        with submit_col:
            if st.button("제출", type="primary", use_container_width=True):
                st.session_state.dictation_input = user_input
                st.session_state.dictation_submitted = True
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


if __name__ == "__main__":
    main()
