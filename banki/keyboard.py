"""Keyboard shortcuts via injected JS.

Streamlit doesn't expose a native shortcut API, so we listen on the parent
document and click buttons by their visible label. Bindings:

    Space        → primary action (가리기 / 구절 확인 / 제출 / 다음)
    →            → next / advance
    ←            → previous
    H            → 힌트
    R            → 다시
    A / +        → font up
    Z / -        → font down

Best-effort: if Streamlit's button labels are inside iframes, only top-level
buttons on the page are clickable. Inside `components.html` iframes, the
parent reference may be `window.parent`.
"""
import streamlit.components.v1 as components


def inject_shortcuts() -> None:
    components.html(
        """
        <script>
        (function() {
            const parentDoc = window.parent.document;
            if (parentDoc._bankiKbBound) return;
            parentDoc._bankiKbBound = true;

            function findButtonByText(matcher) {
                const btns = parentDoc.querySelectorAll('button');
                for (const b of btns) {
                    const t = (b.innerText || '').trim();
                    if (matcher(t)) return b;
                }
                return null;
            }

            function click(matcher) {
                const b = findButtonByText(matcher);
                if (b && !b.disabled) {
                    b.click();
                    return true;
                }
                return false;
            }

            parentDoc.addEventListener('keydown', function(e) {
                // ignore when typing in inputs
                const tag = (e.target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
                    return;
                }
                if (e.metaKey || e.ctrlKey || e.altKey) return;

                const k = e.key;
                if (k === ' ' || k === 'Spacebar') {
                    if (click(t => /가리기|구절 확인|제출|다음|확인하기/.test(t))) {
                        e.preventDefault();
                    }
                } else if (k === 'ArrowRight') {
                    if (click(t => /다음|학습완료|암기완료/.test(t))) e.preventDefault();
                } else if (k === 'ArrowLeft') {
                    if (click(t => /이전/.test(t))) e.preventDefault();
                } else if (k === 'h' || k === 'H') {
                    click(t => /힌트/.test(t));
                } else if (k === 'r' || k === 'R') {
                    click(t => /다시/.test(t));
                } else if (k === '+' || k === '=' || k === 'a') {
                    click(t => t === 'A+');
                } else if (k === '-' || k === 'z') {
                    click(t => t === 'A-');
                } else if (k === 's' || k === 'S') {
                    click(t => /건너뛰기/.test(t));
                }
            });
        })();
        </script>
        """,
        height=0,
    )
