#!/usr/bin/env bash
set -euo pipefail

rm -rf public
mkdir -p public
cp -r assets admin asistencia buffet campamento chat efe glosario icons organizacion lista-sabados perfiles manifest.webmanifest index.html sw.js public/

python3 <<'PY'
from pathlib import Path
p = Path('public/buffet/index.html')
s = p.read_text(encoding='utf-8')
s = s.replace('/assets/tnt-experience.js?v=2', '/assets/tnt-experience.js?v=65')
needle = '<script type="module">'
inject = '<script src="/assets/tnt-buffet-direct.js?v=2"></script>' + needle
if '/assets/tnt-buffet-direct.js?v=2' not in s:
    if needle not in s:
        raise SystemExit('Buffet module script marker not found')
    s = s.replace(needle, inject, 1)
p.write_text(s, encoding='utf-8')
PY
