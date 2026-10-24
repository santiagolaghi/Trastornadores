#!/usr/bin/env bash
set -euo pipefail

rm -rf public
mkdir -p public
cp -r assets admin asistencia buffet campamento chat efe glosario icons organizacion lista-sabados perfiles comunidad perfil biblia juegos manifest.webmanifest icon.svg index.html sw.js public/

python3 <<'PY'
from pathlib import Path
import re
# The source loader stays readable for local development. Production serves
# the same classic scripts in the same order in one response, without eval or
# dynamic imports. No shared script relies on document.currentScript.
loader = Path('assets/tnt-experience.js').read_text(encoding='utf-8')
shared = re.search(r"const files=\[(.*?)\]\.map", loader).group(1)
files = re.findall(r"'([^']+\.js)\?[^']*'", shared)
if len(files) != 16 or len(set(files)) != len(files):
    raise SystemExit('Unexpected TNT shared script manifest')
bundle = '\n;\n'.join('/* '+name+' */\n'+Path('assets', name).read_text(encoding='utf-8') for name in files)
extra = re.search(r"if\(location.pathname.startsWith\('/buffet'\)\)(.*?);\n", loader).group(1)
buffet = re.findall(r"'(/assets/[^']+)'", extra)
bundle += '\n;\nif(location.pathname.startsWith("/buffet"))document.write('+repr(''.join('<script src="'+src+'"><'+'/script>' for src in buffet))+');\n'
Path('public/assets/tnt-experience.js').write_text(bundle, encoding='utf-8')
p = Path('public/buffet/index.html')
s = p.read_text(encoding='utf-8')
s = s.replace('src="/assets/tnt-experience.js?v=20261018r2"', 'src="/assets/tnt-experience.js?v=20261018r2"')
needle = '<script type="module">'
inject = '<script src="/assets/tnt-buffet-direct.js?v=2"></script>' + needle
if '/assets/tnt-buffet-direct.js?v=2' not in s:
    if needle not in s:
        raise SystemExit('Buffet module script marker not found')
    s = s.replace(needle, inject, 1)
p.write_text(s, encoding='utf-8')
PY
