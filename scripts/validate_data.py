#!/usr/bin/env python3
"""فحص سلامة ملفات البيانات قبل الـ commit. أي خطأ = فشل الـ workflow ولا يُنشر شيء."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CF_LIMIT = 24 * 1024 * 1024          # أقل من حد Cloudflare (25 MiB) لكل ملف داخل web/
CORE = ["SPY", "QQQ", "IWM", "GLD", "SPX"]
errors: list[str] = []


def load(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        errors.append(f"JSON تالف: {p.relative_to(ROOT)} ({e})")
        return None


def head_size(rel: str):
    try:
        out = subprocess.run(["git", "cat-file", "-s", f"HEAD:{rel}"], cwd=ROOT,
                             capture_output=True, text=True, check=True)
        return int(out.stdout.strip())
    except Exception:  # noqa: BLE001
        return None


for folder in ("data", "web/data"):
    d = ROOT / folder
    if not d.exists():
        errors.append(f"مجلد مفقود: {folder}")
        continue
    for p in sorted(d.glob("*.json")):
        load(p)

web = ROOT / "web" / "data"
for tk in CORE:
    p = web / f"{tk}.json"
    if not p.exists():
        errors.append(f"ملف أساسي مفقود: web/data/{tk}.json")
        continue
    j = load(p)
    if isinstance(j, dict):
        if not j.get("by_expiration"):
            errors.append(f"{tk}: by_expiration فارغ")
        if not j.get("pull_dates"):
            errors.append(f"{tk}: pull_dates فارغ")
    old = head_size(f"web/data/{tk}.json")
    new = p.stat().st_size
    if old and new < old * 0.5:
        errors.append(f"{tk}: الملف انكمش من {old} إلى {new} بايت (يبدو مقطوعًا)")

if web.exists():
    for p in web.iterdir():
        if p.is_file() and p.stat().st_size > CF_LIMIT:
            errors.append(f"ملف أكبر من حد Cloudflare: web/data/{p.name} ({p.stat().st_size} بايت)")
        if p.name.endswith("_history.json"):
            errors.append(f"ملف history لا يجب أن يكون داخل web/data: {p.name}")

if errors:
    print("❌ فشل فحص البيانات:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("✅ فحص البيانات سليم")
