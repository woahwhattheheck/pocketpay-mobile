"""Run the unchanged baseline collector through a strict host-only adapter."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'baseline'))
sys.path.insert(0, str(root))
path = root / 'baseline/ui_baseline.py'
text = path.read_text()
anchor = '"""Controlled Android UI evidence; no source hooks/router/persistence are replaced here."""'
if text.count(anchor) != 1:
    raise RuntimeError('Original baseline composition anchor changed')
insertion = 'from baseline_host_adapter import install as install_baseline_host\ninstall_baseline_host(globals())\nfrom baseline_history_carrier import install as install_first_history_carrier\ninstall_first_history_carrier(globals())\n'
namespace = {'__name__': '__main__', '__file__': str(path)}
exec(compile(text.replace(anchor, insertion + anchor, 1), str(path), 'exec'), namespace)
