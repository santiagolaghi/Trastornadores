"""Convert the pinned eBible public-domain RV1909 VPL archive into local book files."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import re
import sys

SOURCE_SHA256 = 'c901a31a89421eafa54e82a0a2ad94962c6889e3c5556c2a0834529789c4ac76'
IDS = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK',
       'JOH': 'JHN', 'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}

source = Path(sys.argv[1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256, 'Source archive changed; review before importing.'
with ZipFile(source) as archive:
    text = archive.read('spaRV1909_vpl.txt').decode('utf-8-sig')
books = {}
for line in text.splitlines():
    if not line.strip():
        continue
    match = re.fullmatch(r'([1-3A-Z]{3}) (\d+):(\d+) (.*)', line)
    assert match, 'Unrecognized verse entry'
    original_id, chapter, verse, value = match.groups()
    book_id = IDS.get(original_id, original_id)
    book = books.setdefault(book_id, {'book': book_id, 'source_book': original_id, 'chapters': {}})
    book['chapters'].setdefault(chapter, []).append({'verse': int(verse), 'text': value})
assert len(books) == 66
assert sum(len(b['chapters']) for b in books.values()) == 1189
assert sum(len(v) for b in books.values() for v in b['chapters'].values()) == 31102
destination = Path(__file__).resolve().parent.parent / 'assets/bible/rvr1909'
destination.mkdir(parents=True, exist_ok=True)
for original_id, book_id in IDS.items():
    old = destination / (original_id + '.json')
    if old.exists():
        old.unlink()
for book_id, book in books.items():
    (destination / (book_id + '.json')).write_text(json.dumps(book, ensure_ascii=False, separators=(',', ':')) + '\n')
manifest = {'id': 1909, 'title': 'Reina-Valera 1909', 'abbreviation': 'RVR 1909', 'license': 'Dominio público',
            'source': 'https://ebible.org/Scriptures/spaRV1909_vpl.zip',
            'license_url': 'https://ebible.org/spaRV1909/copyright.htm', 'source_sha256': SOURCE_SHA256,
            'books': 66, 'chapters': 1189, 'verses': 31102, 'book_id_mapping': IDS}
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('RV1909 imported: 66 books, 1189 chapters, 31102 verse positions.')
