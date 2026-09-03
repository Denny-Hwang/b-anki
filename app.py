"""B-Anki: bible memorization app entry point.

The actual logic lives in the ``banki`` package. This module wires the
theme router, top-level page config, and global style injection.
"""
import streamlit as st

from banki import home, keyboard, ordering_mode, quiz_mode, storage, styles, verse_mode


def _route() -> None:
    selected = st.session_state.get("selected_theme")

    if selected is None:
        home.render_home()
        return

    if selected == "verse":
        st.title("📖 성경암기")
        if not st.session_state.get("verse_setup_done", False):
            verse_mode.render_setup_page()
        else:
            verse_mode.render_main_page()
        return

    if selected == "ordering":
        if not st.session_state.get("ord_game_started", False):
            ordering_mode.render_setup()
        else:
            ordering_mode.render_game()
        return

    if selected == "quiz":
        if not st.session_state.get("quiz_started", False):
            quiz_mode.render_setup()
        else:
            quiz_mode.render_game()
        return


def main() -> None:
    st.set_page_config(page_title="B-Anki", page_icon="📖", layout="centered")
    storage.init_db()
    styles.inject_global_styles()
    keyboard.inject_shortcuts()
    _route()


if __name__ == "__main__":
    main()
