"""Downloads the two public session sets at pinned revisions into benchmark/data. Usage: fetch.py [--limit N]"""
import argparse
import json
from pathlib import Path
import random
import time
import urllib.error
import urllib.request

DATA = Path(__file__).resolve().parent / 'data'
DEVELOPMENT = ('SWE-Gym/OpenHands-SFT-Trajectories', '4aaa5a4a4b5861f4799d2336908760c190ac3b17')
UNSEEN = ('nebius/SWE-rebench-openhands-trajectories', '35455389ab51bf5e2306bfd436ef72d0f98bf882')
SEED, PAGES, PAGE_SIZE, CHUNK = 20261122, 6, 50, 10


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'error-evidence-benchmark'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'failed: {url}')


def check_revision(dataset, revision):
    if get(f'https://huggingface.co/api/datasets/{dataset}')['sha'] != revision:
        raise SystemExit(f'{dataset} changed from the pinned revision {revision}')


def rows_at(dataset, split, offset, length):
    url = f'https://datasets-server.huggingface.co/rows?dataset={dataset}&config=default&split={split}&offset={offset}&length={length}'
    page = get(url)
    if any(row.get('truncated_cells') for row in page['rows']):
        raise SystemExit(f'truncated cells at offset {offset}')
    return page['num_rows_total'], [dict(row['row'], source_row=row['row_idx']) for row in page['rows']]


def development_rows(limit):
    dataset, _ = DEVELOPMENT
    total, rows = rows_at(dataset, 'train.success.oss', 0, 100)
    for offset in range(100, total, 100):
        if limit is not None and len(rows) >= limit:
            break
        rows += rows_at(dataset, 'train.success.oss', offset, 100)[1]
    return rows[:limit]


def unseen_rows(limit):
    dataset, _ = UNSEEN
    total = rows_at(dataset, 'train', 0, 1)[0]
    starts = [n * PAGE_SIZE for n in random.Random(SEED).sample(range(total // PAGE_SIZE), PAGES)]
    rows = []
    for start in starts:
        for offset in range(start, start + PAGE_SIZE, CHUNK):
            if limit is not None and len(rows) >= limit:
                return rows[:limit]
            rows += rows_at(dataset, 'train', offset, CHUNK)[1]
            time.sleep(0.4)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, help='fetch only the first N sessions of each set, for a quick check')
    limit = parser.parse_args().limit
    DATA.mkdir(exist_ok=True)
    for name, pin, fetch in (('development', DEVELOPMENT, development_rows), ('unseen', UNSEEN, unseen_rows)):
        check_revision(*pin)
        rows = fetch(limit)
        check_revision(*pin)
        (DATA / f'{name}.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf8')
        print(f'{name}: {len(rows)} sessions')


if __name__ == '__main__':
    main()
