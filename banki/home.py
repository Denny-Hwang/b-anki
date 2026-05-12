"""Home/theme selection screen with optional stats preview."""
import streamlit as st

from . import storage


def render_home() -> None:
    st.markdown("<h1 style='text-align:center;'>📖 B-Anki</h1>", unsafe_allow_html=True)
    st.markdown(
        "<p style='text-align:center; color:var(--b-muted); font-size:18px;'>성경 암기 훈련 도우미</p>",
        unsafe_allow_html=True,
    )
    st.markdown("")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown(
            """
            <div class="theme-card">
                <div style="font-size:48px;">📜</div>
                <h3>테마 1</h3>
                <h4>성경구절 암기</h4>
                <p>구절을 보고 학습/테스트하는 플래시카드<br>
                <small>간격 반복(SRS) · 받아쓰기 채점 · TTS 지원</small></p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("📜 성경구절 암기 시작", use_container_width=True, type="primary"):
            st.session_state.selected_theme = "verse"
            st.rerun()

    with col2:
        st.markdown(
            """
            <div class="theme-card">
                <div style="font-size:48px;">🔢</div>
                <h3>테마 2</h3>
                <h4>단어순서 외우기</h4>
                <p>성경 책 이름의 순서를 맞추는 게임<br>
                <small>구약 39권 · 신약 27권 · 점진적 힌트</small></p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("🔢 단어순서 외우기 시작", use_container_width=True, type="primary"):
            st.session_state.selected_theme = "ordering"
            st.rerun()

    st.markdown("---")

    with st.expander("📊 내 학습 통계 보기"):
        existing_user = st.session_state.get("last_user_name", "")
        name_input = st.text_input(
            "이름을 입력해 통계를 조회하세요",
            value=existing_user,
            placeholder="이름 입력",
            key="home_stats_name",
        )
        if name_input.strip():
            storage.init_db()
            users = {u["name"]: u["id"] for u in storage.list_users()}
            if name_input.strip() not in users:
                st.info("아직 학습 기록이 없는 사용자입니다.")
            else:
                from . import stats as stats_module
                user_id = users[name_input.strip()]
                stats_module.render_dashboard(user_id, name_input.strip())
                st.session_state.last_user_name = name_input.strip()

    st.markdown(
        "<p style='text-align:center; color:var(--b-muted); font-size:12px; margin-top:30px;'>"
        "💡 단축키: Space=확인 · ←→=이동 · H=힌트 · A+/A-=글자 크기"
        "</p>",
        unsafe_allow_html=True,
    )
