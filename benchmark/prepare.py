"""Extracts every failed tool result from the fetched sessions into benchmark/data/failures.jsonl."""
import json
from pathlib import Path
import random
import re

DATA = Path(__file__).resolve().parent / 'data'
SEED = 20261122
DEVELOPMENT_REPOS = {'getmoto/moto', 'Project-MONAI/MONAI', 'pandas-dev/pandas', 'python/mypy', 'dask/dask', 'iterative/dvc',
                     'conan-io/conan', 'pydantic/pydantic', 'facebookresearch/hydra', 'modin-project/modin', 'bokeh/bokeh'}
FAILED = re.compile(r'\[Command finished with exit code (?!0\])\d+\]')
RESULT = re.compile(r'^EXECUTION RESULT of \[[\w-]+\]:\n?')


def text_of(content):
    if isinstance(content, list):
        return '\n'.join(part.get('text', '') for part in content if isinstance(part, dict))
    return content or ''


def development_failures(rows):
    for n, row in enumerate(rows):
        for message in row['messages']:
            match = RESULT.match(message['content']) if message['role'] == 'user' else None
            if match and FAILED.search(message['content'][match.end():]):
                yield {'set': 'development', 'session': n, 'output': message['content'][match.end():]}


def one_per_unseen_repo(rows):
    ordered = sorted(rows, key=lambda row: row['source_row'])
    random.Random(SEED).shuffle(ordered)
    seen = set()
    for row in ordered:
        if row['repo'] not in DEVELOPMENT_REPOS and row['repo'] not in seen:
            seen.add(row['repo'])
            yield row


def unseen_failures(rows):
    for n, row in enumerate(one_per_unseen_repo(rows)):
        messages = json.loads(row['trajectory']) if isinstance(row['trajectory'], str) else row['trajectory']
        for message in messages:
            body = text_of(message.get('content')) if message['role'] == 'tool' else ''
            if FAILED.search(body):
                yield {'set': 'unseen', 'session': n, 'output': body}


def main():
    development = json.loads((DATA / 'development.json').read_text(encoding='utf8'))
    unseen = json.loads((DATA / 'unseen.json').read_text(encoding='utf8'))
    count = 0
    with (DATA / 'failures.jsonl').open('w', encoding='utf8') as out:
        for row in [*development_failures(development), *unseen_failures(unseen)]:
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
            count += 1
    print(f'{count} failed results')


if __name__ == '__main__':
    main()
