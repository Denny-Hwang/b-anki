import streamlit as st
import pandas as pd
import random
import os

BIBLE_VERSIONS = {
    "개역개정": "verse_krv",
    "NIV": "verse_niv",
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def load_csv(file_path: str) -> pd.DataFrame:
    df = pd.read_csv(file_path)
    return df


def get_available_files() -> list[str]:
    if not os.path.isdir(DATA_DIR):
        return []
    return [f for f in os.listdir(DATA_DIR) if f.endswith(".csv")]


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


def main():
    st.set_page_config(page_title="B-Anki 성경 암기", page_icon="📖", layout="centered")
    st.title("B-Anki 성경 암기")

    # --- File selection ---
    files = get_available_files()
    if not files:
        st.warning("data/ 폴더에 CSV 파일이 없습니다. CSV 파일을 추가해 주세요.")
        return

    selected_file = st.selectbox("학습할 파일을 선택하세요", files)

    # --- Bible version ---
    version_label = st.selectbox("성경 버전", list(BIBLE_VERSIONS.keys()))
    verse_col = BIBLE_VERSIONS[version_label]

    # --- Shuffle toggle ---
    shuffle = st.toggle("랜덤 순서", value=False)

    # --- Load data ---
    df = load_csv(os.path.join(DATA_DIR, selected_file))

    if verse_col not in df.columns:
        st.error(f"선택한 파일에 '{verse_col}' 열이 없습니다.")
        return

    # --- Start / Restart ---
    need_init = (
        "started" not in st.session_state
        or st.session_state.get("loaded_file") != selected_file
        or st.session_state.get("loaded_version") != version_label
    )

    if need_init:
        init_session_state(df, shuffle)
        st.session_state.loaded_file = selected_file
        st.session_state.loaded_version = version_label

    if st.button("처음부터 다시 시작"):
        init_session_state(df, shuffle)
        st.session_state.loaded_file = selected_file
        st.session_state.loaded_version = version_label
        st.rerun()

    # --- Reshuffle when toggle changes ---
    if st.session_state.get("prev_shuffle") != shuffle:
        st.session_state.prev_shuffle = shuffle
        remaining = [
            i for i in st.session_state.order[st.session_state.current_idx :]
            if i not in st.session_state.completed
        ]
        if shuffle:
            random.shuffle(remaining)
        else:
            remaining.sort()
        st.session_state.order = (
            st.session_state.order[: st.session_state.current_idx] + remaining
        )

    # --- Progress ---
    total = len(df)
    completed_count = len(st.session_state.completed)
    st.progress(completed_count / total if total else 0)
    st.caption(f"진행: {completed_count} / {total}")

    # --- Find next card ---
    order = st.session_state.order
    idx = st.session_state.current_idx

    while idx < len(order) and order[idx] in st.session_state.completed:
        idx += 1
    st.session_state.current_idx = idx

    if idx >= len(order):
        st.success("모든 구절을 완료했습니다! 🎉")
        if st.session_state.skipped:
            st.info(f"건너뛴 구절: {len(st.session_state.skipped)}개")
            if st.button("건너뛴 구절 다시 학습"):
                skipped_list = list(st.session_state.skipped)
                if shuffle:
                    random.shuffle(skipped_list)
                st.session_state.order = skipped_list
                st.session_state.current_idx = 0
                st.session_state.skipped = set()
                st.session_state.show_verse = False
                st.rerun()
        return

    row = df.iloc[order[idx]]
    location = row["location"]
    verse_text = row[verse_col]

    # --- Card display ---
    st.divider()
    st.subheader(location)

    if st.session_state.show_verse:
        st.markdown(f"> {verse_text}")
    else:
        if st.button("구절 확인", type="primary", use_container_width=True):
            st.session_state.show_verse = True
            st.rerun()

    # --- Action buttons ---
    if st.session_state.show_verse:
        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("⏭️ 건너뛰기", use_container_width=True):
                st.session_state.skipped.add(order[idx])
                st.session_state.current_idx += 1
                st.session_state.show_verse = False
                st.rerun()

        with col2:
            if st.button("🔄 다시하기", use_container_width=True):
                st.session_state.show_verse = False
                st.rerun()

        with col3:
            if st.button("✅ 암기완료", use_container_width=True):
                st.session_state.completed.add(order[idx])
                st.session_state.skipped.discard(order[idx])
                st.session_state.current_idx += 1
                st.session_state.show_verse = False
                st.rerun()


if __name__ == "__main__":
    main()
