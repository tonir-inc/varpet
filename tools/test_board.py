"""Integration tests: all mutations and commits stay in temporary repositories."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('board.py').resolve()


class BoardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Board Test')
        self.git('config', 'user.email', 'board@example.invalid')
        (self.root / '.gitignore').write_text('.board-seen-*\n')
        self.git('add', '.gitignore')
        self.git('commit', '-m', 'initial')

    def git(self, *args):
        result = subprocess.run(['git', '-C', str(self.root), *args], env=self.env,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def cli(self, *args, input=None, cwd=None, ok=True):
        result = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd or self.root,
                                env=self.env, text=True, input=input, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def post(self, sender='catalog', to='editor', topic='Contract', body='Use dimensions.'):
        return self.cli('post', '--from', sender, '--to', to, '--topic', topic, body).stdout.strip()

    def test_post_from_nested_cwd_and_stdin_stages_only_message(self):
        (self.root / 'nested').mkdir()
        (self.root / 'unrelated.txt').write_text('unchanged index')
        self.git('add', 'unrelated.txt')
        result = self.cli('post', '--from', 'catalog', '--to', 'editor,designer',
                          '--topic', 'Dimensions: cm', '-', input='Hello\n**world**', cwd=self.root / 'nested')
        ident = result.stdout.strip()
        text = (self.root / f'board/messages/{ident}.md').read_text()
        self.assertIn('id: ' + ident, text)
        self.assertIn('Hello\n**world**', text)
        self.assertEqual(self.git('log', '-1', '--format=%s'), 'initial')
        self.assertEqual(set(self.git('diff', '--cached', '--name-only').splitlines()),
                         {f'board/messages/{ident}.md', 'unrelated.txt'})

    def test_list_filters_and_order(self):
        direct = self.post(topic='Direct')
        broadcast = self.post(to='all', topic='Broadcast')
        other = self.post(sender='designer', to='architect', topic='Other')
        self.cli('close', direct)
        output = self.cli('list', '--to', 'editor', '--from', 'catalog', '--open').stdout
        self.assertIn(broadcast, output)
        self.assertNotIn(direct, output)
        self.assertNotIn(other, output)
        ids = [other, broadcast, direct]
        self.assertEqual([line.split()[0] for line in self.cli('list').stdout.splitlines()], ids)
        self.assertEqual(len(self.cli('list', '--limit', '1').stdout.splitlines()), 1)
        self.assertEqual(self.cli('list', '--limit', '0').stdout, '')
        self.assertEqual(len(self.cli('list', '--since', ids[-1]).stdout.splitlines()), 2)
        self.assertEqual(len(self.cli('list', '--since', '2000-01-01').stdout.splitlines()), 3)
        self.assertEqual(self.cli('list', '--since', '9999-01-01').stdout, '')

    def test_reply_thread_close_and_note(self):
        original = self.post()
        reply = self.cli('reply', original, '--from', 'editor', 'Implemented.').stdout.strip()
        nested = self.cli('reply', reply, '--from', 'catalog', 'Verified.').stdout.strip()
        output = self.cli('show', original).stdout
        for ident in (original, reply, nested):
            self.assertIn(ident, output)
        self.assertIn('to: catalog', self.cli('show', reply).stdout)
        self.assertIn('topic: Re: Contract', output)
        self.assertIn('replies:1', self.cli('list', '--from', 'editor').stdout)
        self.cli('close', original, 'Resolved.', '--from', 'catalog')
        output = self.cli('show', original).stdout
        self.assertIn('status: done', output)
        self.assertIn('catalog: Resolved.', output)

    def test_unread_marks_only_addressed_and_is_local(self):
        direct = self.post()
        broadcast = self.post(to='all')
        other = self.post(to='architect')
        first = self.cli('unread', '--as', 'editor').stdout
        self.assertIn(direct, first)
        self.assertIn(broadcast, first)
        self.assertNotIn(other, first)
        self.assertEqual(first, self.cli('unread', '--as', 'editor', '--mark').stdout)
        self.assertEqual(self.cli('unread', '--as', 'editor').stdout, '')
        self.assertIn(broadcast, self.cli('unread', '--as', 'designer').stdout)
        self.assertEqual(self.git('check-ignore', '.board-seen-editor'), '.board-seen-editor')

    def test_unread_for_several_lanes_lists_each_message_once(self):
        editor = self.post(to='editor')
        both = self.post(to='editor,architect')
        other = self.post(to='catalog')
        first = self.cli('unread', '--as', 'architect,editor', '--mark').stdout
        self.assertIn(editor, first)
        self.assertEqual(first.count(both), 1)
        self.assertNotIn(other, first)
        self.assertEqual(self.cli('unread', '--as', 'editor').stdout, '')
        self.assertEqual(self.cli('unread', '--as', 'architect').stdout, '')

    def test_concurrent_posts_have_distinct_files(self):
        # Separate clones model different teammates with independent indexes.
        roots = [self.root / f'clone{i}' for i in range(12)]
        for root in roots:
            self.git('clone', '-q', str(self.root), str(root))
        def send(root):
            return self.cli('post', '--from', 'catalog', '--to', 'editor', '--topic', 'Same topic',
                            'Same body', cwd=root).stdout.strip()
        with ThreadPoolExecutor(max_workers=12) as pool:
            ids = list(pool.map(send, roots))
        self.assertEqual(len(set(ids)), 12)
        for root, ident in zip(roots, ids):
            self.assertTrue((root / f'board/messages/{ident}.md').is_file())
            self.assertRegex(ident, r'^\d{8}T\d{6}Z-catalog-same-topic-[a-f0-9]{32}$')

    def test_commit_preserves_unrelated_staged_changes(self):
        (self.root / 'code.txt').write_text('staged code')
        self.git('add', 'code.txt')
        ident = self.cli('post', '--from', 'catalog', '--to', 'editor', '--topic', 'Commit',
                         '--commit', 'Message').stdout.strip()
        self.assertEqual(self.git('show', '--format=', '--name-only', 'HEAD'), f'board/messages/{ident}.md')
        self.assertEqual(self.git('diff', '--cached', '--name-only'), 'code.txt')
        self.assertEqual(self.git('log', '-1', '--format=%s'), 'board: catalog → editor: Commit')

    def remote(self):
        remote = self.root / 'remote.git'
        self.git('init', '--bare', str(remote))
        self.git('remote', 'add', 'origin', str(remote))
        self.git('push', '-u', 'origin', 'main')
        return remote

    def test_push_and_sync(self):
        remote = self.remote()
        ident = self.cli('post', '--from', 'catalog', '--to', 'editor', '--topic', 'Shared',
                         '--push', 'Ready').stdout.strip()
        self.assertIn(ident, self.git('--git-dir', str(remote), 'ls-tree', '-r', '--name-only', 'main'))
        self.cli('close', ident)
        self.git('commit', '-m', 'board: resolved')
        self.cli('sync')
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.git('rev-parse', 'origin/main'))

    def test_sync_refuses_nonboard_staged_and_outgoing_changes(self):
        self.remote()
        (self.root / 'code.txt').write_text('code')
        self.git('add', 'code.txt')
        self.assertIn('non-board staged', self.cli('sync', ok=False).stderr)
        self.git('commit', '-m', 'code')
        self.assertIn('outgoing non-board', self.cli('sync', ok=False).stderr)

    def test_errors_warnings_and_help(self):
        result = self.cli('post', '--from', 'other', '--to', 'editor', '--topic', 'Hi', 'Body')
        self.assertIn('warning: unknown lane', result.stderr)
        for args in [('show', '../escape'), ('show', '20260101T000000Z-editor-missing'),
                     ('list', '--limit', '-1'), ('list', '--since', 'nonsense'),
                     ('post', '--from', 'Bad', '--to', 'editor', '--topic', 'Hi', 'Body'),
                     ('post', '--from', 'editor', '--to', 'all', '--topic', 'Hi\ninjected: yes', 'Body')]:
            self.assertIn('error' if 'Bad' in args else 'board:', self.cli(*args, ok=False).stderr)
        for command in ('post', 'list', 'show', 'reply', 'close', 'unread', 'sync'):
            self.assertIn('usage:', self.cli(command, '--help').stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
