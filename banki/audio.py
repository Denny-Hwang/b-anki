"""Audio: TTS via Web Speech API + lightweight sound effects."""
import html
import streamlit.components.v1 as components


def speak_verse(verse: str, lang: str = "ko-KR", rate: float = 0.9) -> None:
    """Render an on-page TTS player using the Web Speech API.

    Uses a user-gesture button so browsers honor the playback request.
    """
    safe = html.escape(verse or "").replace("`", "\\`")
    safe_lang = html.escape(lang)
    components.html(
        f"""
        <div style="text-align:center; margin: 4px 0;">
            <button id="banki-tts-btn"
                style="background:#3b82f6; color:white; border:none; border-radius:8px;
                       padding:8px 14px; font-size:14px; cursor:pointer; min-height:36px;"
                aria-label="구절 듣기">
                🔊 구절 듣기
            </button>
            <button id="banki-tts-stop"
                style="background:#94a3b8; color:white; border:none; border-radius:8px;
                       padding:8px 14px; font-size:14px; cursor:pointer; min-height:36px;
                       margin-left: 6px;"
                aria-label="듣기 정지">
                ⏹️ 정지
            </button>
        </div>
        <script>
        (function() {{
            const btn = document.getElementById('banki-tts-btn');
            const stopBtn = document.getElementById('banki-tts-stop');
            if (!btn || !('speechSynthesis' in window)) {{
                if (btn) btn.disabled = true;
                if (btn) btn.textContent = '🔇 미지원 브라우저';
                return;
            }}
            btn.addEventListener('click', function() {{
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(`{safe}`);
                u.lang = '{safe_lang}';
                u.rate = {rate};
                window.speechSynthesis.speak(u);
            }});
            stopBtn.addEventListener('click', function() {{
                window.speechSynthesis.cancel();
            }});
        }})();
        </script>
        """,
        height=56,
    )


def play_sound(kind: str) -> None:
    """Play a short sound effect: success | fail | complete."""
    presets = {
        "success": [(523.25, 0.10), (659.25, 0.12), (783.99, 0.18)],
        "fail":    [(311.13, 0.18), (233.08, 0.22)],
        "complete":[(523.25, 0.12), (659.25, 0.12), (783.99, 0.12), (1046.50, 0.30)],
    }
    notes = presets.get(kind)
    if not notes:
        return
    import json
    notes_js = json.dumps(notes)
    components.html(
        f"""
        <script>
        (function() {{
            try {{
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const notes = {notes_js};
                let t = ctx.currentTime;
                notes.forEach(([f, d]) => {{
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.value = f;
                    gain.gain.setValueAtTime(0, t);
                    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + d);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + d);
                    t += d;
                }});
            }} catch (e) {{}}
        }})();
        </script>
        """,
        height=0,
    )
