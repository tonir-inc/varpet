#!/usr/bin/env python3
"""Git-backed, one-file-per-message lane communication (Python 3.11+)."""
import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
import sys
import uuid

LANES = {'catalog', 'designer', 'editor', 'architect', 'all'}
ID = re.compile(r'\d{8}T\d{6}Z-[a-z]+-[a-z0-9-]+')


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(result.stderr.strip() or result.stdout.strip() or 'git command failed')
    return result.stdout.strip()


def lane(value):
    if not re.fullmatch('[a-z]+', value):
        raise argparse.ArgumentTypeError('lanes must be lowercase words')
    if value not in LANES:
        print(f'warning: unknown lane {value!r}', file=sys.stderr)
    return value


def recipients(value):
    return ','.join(dict.fromkeys(lane(item.strip()) for item in value.split(',')))


def single_line(value):
    if not value.strip() or any(c in value for c in '\r\n\x00'):
        raise ValueError('topic must be a nonempty single line')
    return value.strip()


def path_for(root, ident):
    if not ID.fullmatch(ident):
        raise ValueError(f'invalid message id: {ident}')
    return root / 'board/messages' / f'{ident}.md'


def read_message(path):
    lines = path.read_text(encoding='utf-8').splitlines()
    if not lines or lines[0] != '---':
        raise ValueError(f'{path.name}: missing front matter')
    try:
        end = lines.index('---', 1)
        data = dict(line.split(': ', 1) for line in lines[1:end])
        for key in ('id', 'from', 'to', 'topic', 'status', 'created'):
            if not data[key]:
                raise ValueError(f'empty {key}')
        if data['id'] != path.stem or data['status'] not in ('open', 'done'):
            raise ValueError('invalid id or status')
    except (ValueError, KeyError) as exc:
        raise ValueError(f'{path.name}: invalid front matter ({exc})') from exc
    data['body'] = '\n'.join(lines[end + 1:]).strip()
    return data


def serialize(data):
    keys = ('id', 'from', 'to', 'topic', 're', 'status', 'created')
    return '---\n' + ''.join(f'{k}: {data[k]}\n' for k in keys if k in data) + '---\n\n' + data['body'] + '\n'


def messages(root):
    return sorted((read_message(p) for p in (root / 'board/messages').glob('*.md')), key=lambda m: (m['created'], m['id']), reverse=True)


def get_message(root, ident):
    path = path_for(root, ident)
    if not path.is_file():
        raise ValueError(f'message not found: {ident}')
    return read_message(path)


def addressed(message, who):
    return who in message['to'].split(',') or 'all' in message['to'].split(',')


def ensure_board_index(root):
    staged = git(root, 'diff', '--cached', '--name-only', '-z').split('\0')
    if any(p and not p.startswith('board/') for p in staged):
        raise ValueError('non-board staged changes; commit or unstage them before syncing')


def sync(root):
    ensure_board_index(root)
    # A push sends every outgoing commit, so refuse to publish unrelated work.
    upstream = git(root, 'rev-parse', '--abbrev-ref', '@{upstream}')
    outgoing = git(root, 'rev-list', f'{upstream}..HEAD').splitlines()
    for commit in outgoing:
        paths = git(root, 'diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', commit).splitlines()
        if any(not p.startswith('board/') for p in paths):
            raise ValueError('outgoing non-board commits; sync would also push unrelated work')
    git(root, 'pull', '--rebase')
    if git(root, 'rev-list', '@{upstream}..HEAD'):
        git(root, 'push')


def post(root, sender, to, topic, body, reply=None, commit=False, push=False):
    topic = single_line(topic)
    if reply:
        get_message(root, reply)
    if body == '-':
        body = sys.stdin.read()
    if not body.strip():
        raise ValueError('message body is empty')
    if push:
        ensure_board_index(root)
    now = datetime.now(timezone.utc)
    slug = re.sub('[^a-z0-9]+', '-', topic.lower()).strip('-')[:48] or 'message'
    directory = root / 'board/messages'
    directory.mkdir(parents=True, exist_ok=True)
    while True:
        ident = f'{now:%Y%m%dT%H%M%SZ}-{sender}-{slug}-{uuid.uuid4().hex}'
        path = path_for(root, ident)
        data = dict(id=ident, **{'from': sender}, to=to, topic=topic,
                    status='open', created=now.isoformat().replace('+00:00', 'Z'), body=body.strip())
        if reply:
            data['re'] = reply
        try:
            with path.open('x', encoding='utf-8') as stream:
                stream.write(serialize(data))
            break
        except FileExistsError:
            continue
    relative = str(path.relative_to(root))
    git(root, 'add', '--', relative)
    if commit or push:
        git(root, 'commit', '--only', '-m', f'board: {sender} → {to}: {topic}', '--', relative)
    print(ident, flush=True)
    if push:
        sync(root)


def summary(message, all_messages):
    count = sum(m.get('re') == message['id'] for m in all_messages)
    return f"{message['id']}  {message['from']}→{message['to']}  {message['status']}  {message['topic']}  replies:{count}"


def since_filter(root, value):
    if ID.fullmatch(value):
        value = get_message(root, value)['created']
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ValueError('--since expects a message ID or ISO date/datetime') from exc
    return lambda m: datetime.fromisoformat(m['created'].replace('Z', '+00:00')) > date


QA_LANES = ('designer', 'editor', 'catalog', 'architect', 'unknown')
SEVERITIES = ('blocker', 'major', 'minor', 'polish')
QA_STATUSES = ('open', 'fixing', 'fixed', 'wontfix', 'duplicate')
QA_KEYS = ('id', 'lane', 'severity', 'status', 'title', 'reported_by', 'created', 'fixed_in', 'dup_of')


def qa_serialize(issue):
    return '---\n' + ''.join(f'{key}: {json.dumps(issue[key], ensure_ascii=False)}\n'
                              for key in QA_KEYS if key in issue) + '---\n\n' + issue['body'].strip() + '\n'


def qa_issues(root):
    issues = []
    for path in (root / 'board/qa').glob('*.md'):
        if path.name == 'INDEX.md':
            continue
        lines = path.read_text(encoding='utf-8').splitlines()
        try:
            if lines[0] != '---':
                raise ValueError('missing front matter')
            end = lines.index('---', 1)
            issue = {}
            for line in lines[1:end]:
                key, value = line.split(': ', 1)
                issue[key] = json.loads(value) if value.startswith('"') else value
            if any(not isinstance(issue.get(k), str) or not issue[k] for k in QA_KEYS[:7]):
                raise ValueError('missing required fields')
            if (issue['id'] != path.stem or not ID.fullmatch(issue['id'])
                    or issue['lane'] not in QA_LANES or issue['severity'] not in SEVERITIES
                    or issue['status'] not in QA_STATUSES):
                raise ValueError('invalid id, lane, severity or status')
            datetime.fromisoformat(issue['created'].replace('Z', '+00:00'))
            issue['body'] = '\n'.join(lines[end + 1:]).strip()
            issues.append(issue)
        except (ValueError, KeyError, IndexError) as exc:
            raise ValueError(f'{path.name}: invalid QA issue ({exc})') from exc
    return sorted(issues, key=lambda i: (SEVERITIES.index(i['severity']), i['created'], i['id']))


def qa_get(root, prefix):
    matches = [i for i in qa_issues(root) if i['id'].startswith(prefix)] if prefix else []
    if len(matches) != 1:
        raise ValueError(f"{'ambiguous' if matches else 'unknown'} QA id: {prefix}")
    return matches[0]


def qa_short(issue, issues):
    ident = issue['id']
    for length in range(18, len(ident) + 1):
        if sum(i['id'].startswith(ident[:length]) for i in issues) == 1:
            return ident[:length]
    return ident


def qa_index(root):
    issues = [i for i in qa_issues(root) if i['status'] in ('open', 'fixing')]
    rows = ['# QA board', '', 'Generated by `python3 tools/board.py qa summary`. Open includes fixing.', '']
    for owner in QA_LANES:
        rows.extend([f'## {owner}', ''])
        selected = [i for i in issues if i['lane'] == owner]
        for i in selected:
            title = i['title'].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            title = re.sub(r'([\\`*{}\[\]()#+.!_|])', r'\\\1', title)
            rows.append(f"- **{i['severity']}** · {i['status']} · [{title}]({i['id']}.md)")
        if not selected:
            rows.append('No open issues.')
        rows.append('')
    path = root / 'board/qa/INDEX.md'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(rows), encoding='utf-8')
    git(root, 'add', '--', str(path.relative_to(root)))
    return issues


def qa_run(root, args):
    now = datetime.now(timezone.utc)
    date = now.isoformat().replace('+00:00', 'Z')
    if args.qa_command == 'add':
        title = single_line(args.title)
        reporter = single_line(args.by)
        # Validate paths before writing anything; oversized evidence is skipped, never staged.
        images = []
        for name in args.image:
            source = Path(name)
            if not source.is_file():
                raise ValueError(f'image not found: {name}')
            if source.stat().st_size > 2 * 1024 * 1024:
                print(f'warning: skipping image over 2 MB: {name}', file=sys.stderr)
                continue
            if source.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError(f'image must be PNG: {name}')
            images.append(source)
        slug = re.sub('[^a-z0-9]+', '-', title.lower()).strip('-')[:48] or 'issue'
        ident = f'{now:%Y%m%dT%H%M%SZ}-{args.lane}-{slug}-{uuid.uuid4().hex}'
        directory = root / 'board/qa'
        directory.mkdir(parents=True, exist_ok=True)
        evidence = []
        paths = []
        for number, source in enumerate(images, 1):
            target = directory / 'img' / f'{ident}-{number}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            paths.append(str(target.relative_to(root)))
            evidence.append(f'![Screenshot {number}](img/{target.name})')
        body = '\n\n'.join(f'**{heading}**\n\n{value}' for heading, value in (
            ('Steps', args.steps), ('Expected', args.expected), ('Actual', args.actual),
            ('Evidence', '\n'.join(evidence)), ('Notes', '')))
        issue = dict(id=ident, lane=args.lane, severity=args.severity, status='open', title=title,
                     reported_by=reporter, created=date, body=body)
        path = directory / f'{ident}.md'
        with path.open('x', encoding='utf-8') as stream:
            stream.write(qa_serialize(issue))
        git(root, 'add', '--', str(path.relative_to(root)), *paths)
        qa_index(root)
        print(ident)
    elif args.qa_command in ('show', 'set'):
        issue = qa_get(root, args.id)
        if args.qa_command == 'show':
            print(qa_serialize(issue), end='')
            return
        issue['status'] = args.status
        if args.fixed_in:
            if not re.fullmatch(r'[0-9a-fA-F]{4,40}', args.fixed_in):
                raise ValueError('--fixed-in expects a commit SHA (4–40 hex characters)')
            issue['fixed_in'] = args.fixed_in
        if args.note:
            if '**Notes**' not in issue['body'].splitlines():
                issue['body'] += '\n\n**Notes**'
            issue['body'] += f'\n\n- {date}: {args.note.strip()}'
        path = root / 'board/qa' / f"{issue['id']}.md"
        path.write_text(qa_serialize(issue), encoding='utf-8')
        git(root, 'add', '--', str(path.relative_to(root)))
        qa_index(root)
        print(issue['id'])
    elif args.qa_command == 'summary':
        issues = qa_index(root)
        print('lane       blocker major minor polish')
        for owner in QA_LANES:
            counts = [sum(i['lane'] == owner and i['severity'] == s for i in issues) for s in SEVERITIES]
            print(f"{owner:10} " + ' '.join(f'{count:5}' for count in counts))
    else:
        issues = qa_issues(root)
        print('id-short  lane  severity  status  title')
        for i in issues:
            if args.lane and i['lane'] != args.lane:
                continue
            if args.severity and i['severity'] != args.severity:
                continue
            if args.status and i['status'] != args.status:
                continue
            if args.open and i['status'] not in ('open', 'fixing'):
                continue
            print(f"{qa_short(i, issues)}  {i['lane']}  {i['severity']}  {i['status']}  {i['title']}")


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest='command', required=True)
    for name in ('post', 'reply'):
        sub = commands.add_parser(name, help=f'{name.capitalize()} a message and stage its file')
        if name == 'reply':
            sub.add_argument('id')
        sub.add_argument('--from', dest='sender', required=True, type=lane)
        if name == 'post':
            sub.add_argument('--to', required=True, type=recipients)
            sub.add_argument('--topic', required=True)
            sub.add_argument('--re')
        sub.add_argument('body', help='Markdown text, or - to read stdin')
        sub.add_argument('--commit', action='store_true', help='Commit only this message')
        sub.add_argument('--push', action='store_true', help='Commit, pull --rebase, and push')
    sub = commands.add_parser('list', help='List messages newest first')
    sub.add_argument('--to', type=lane)
    sub.add_argument('--from', dest='sender', type=lane)
    sub.add_argument('--open', action='store_true')
    sub.add_argument('--since', help='Exclusive message ID or ISO date/datetime (naive dates use UTC)')
    sub.add_argument('--limit', type=int)
    sub = commands.add_parser('show', help='Print a message and all its nested replies')
    sub.add_argument('id')
    sub = commands.add_parser('close', help='Mark done and stage the message; does not commit')
    sub.add_argument('id')
    sub.add_argument('--from', dest='sender', type=lane)
    sub.add_argument('note', nargs='?')
    sub = commands.add_parser('unread', help='List unseen messages addressed to your lane or all')
    sub.add_argument('--as', dest='lane', required=True, type=recipients,
                     help='Your lane, or several comma-separated')
    sub.add_argument('--mark', action='store_true', help='Mark displayed messages seen locally')
    commands.add_parser('sync', help='Pull --rebase and push outgoing board-only commits; requires a clean tree')
    qa = commands.add_parser('qa', help='Log and track manual QA issues').add_subparsers(dest='qa_command', required=True)
    sub = qa.add_parser('add', help='Log an issue and stage its evidence and overview')
    sub.add_argument('--lane', choices=QA_LANES, required=True)
    sub.add_argument('--severity', choices=SEVERITIES, required=True)
    sub.add_argument('--title', required=True)
    for field in ('steps', 'expected', 'actual'):
        sub.add_argument('--' + field, default='')
    sub.add_argument('--image', action='append', default=[], help='PNG screenshot, at most 2 MB; repeatable')
    sub.add_argument('--by', default='Sergey')
    sub = qa.add_parser('list')
    sub.add_argument('--lane', choices=QA_LANES)
    sub.add_argument('--severity', choices=SEVERITIES)
    status = sub.add_mutually_exclusive_group()
    status.add_argument('--status', choices=QA_STATUSES)
    status.add_argument('--open', action='store_true', help='Include open and fixing issues')
    sub = qa.add_parser('show')
    sub.add_argument('id')
    sub = qa.add_parser('set')
    sub.add_argument('id')
    sub.add_argument('--status', choices=QA_STATUSES, required=True)
    sub.add_argument('--fixed-in')
    sub.add_argument('--note')
    qa.add_parser('summary', help='Print unresolved counts and regenerate/stage INDEX.md')
    return p


def main():
    p = parser()
    args = p.parse_args()
    try:
        root = Path(git(Path.cwd(), 'rev-parse', '--show-toplevel'))
        if args.command == 'qa':
            qa_run(root, args)
        elif args.command in ('post', 'reply'):
            if args.command == 'reply':
                original = get_message(root, args.id)
                post(root, args.sender, original['from'], 'Re: ' + original['topic'], args.body, args.id, args.commit, args.push)
            else:
                post(root, args.sender, args.to, args.topic, args.body, args.re, args.commit, args.push)
        elif args.command == 'sync':
            sync(root)
        elif args.command == 'close':
            m = get_message(root, args.id)
            m['status'] = 'done'
            if args.note:
                note = single_line(args.note)
                m['body'] += '\n\n' + (f"{args.sender}: " if args.sender else '') + note
            path = path_for(root, args.id)
            path.write_text(serialize(m), encoding='utf-8')
            git(root, 'add', '--', str(path.relative_to(root)))
            print(args.id)
        elif args.command == 'show':
            all_messages = messages(root)
            pending = [get_message(root, args.id)]
            seen = set()
            while pending:
                m = pending.pop()
                if m['id'] in seen:
                    continue
                seen.add(m['id'])
                print(serialize(m))
                pending.extend(child for child in all_messages if child.get('re') == m['id'])
        else:
            all_messages = messages(root)
            selected = all_messages
            if args.command == 'unread':
                unseen = {}
                for who in args.lane.split(','):
                    seen_path = root / f'.board-seen-{who}'
                    seen = set(seen_path.read_text(encoding='utf-8').splitlines()) if seen_path.exists() else set()
                    unseen[seen_path] = [m for m in selected if addressed(m, who) and m['id'] not in seen]
                ids = {m['id'] for found in unseen.values() for m in found}
                selected = [m for m in selected if m['id'] in ids]
                if args.mark:
                    for seen_path, found in unseen.items():
                        with seen_path.open('a', encoding='utf-8') as stream:
                            stream.writelines(m['id'] + '\n' for m in found)
            else:
                if args.to:
                    selected = [m for m in selected if addressed(m, args.to)]
                if args.sender:
                    selected = [m for m in selected if m['from'] == args.sender]
                if args.open:
                    selected = [m for m in selected if m['status'] == 'open']
                if args.since:
                    selected = list(filter(since_filter(root, args.since), selected))
                if args.limit is not None:
                    if args.limit < 0:
                        raise ValueError('--limit must be nonnegative')
                    selected = selected[:args.limit]
            for m in selected:
                print(summary(m, all_messages))
    except (ValueError, OSError) as exc:
        print(f'board: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
