try:  # trace every Codex conversation in this process; see observe.py
    from .observe import install as _install_trace

    _install_trace()
except Exception:  # tracing must never stop the harness from importing
    pass
