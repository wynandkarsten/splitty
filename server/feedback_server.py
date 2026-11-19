#!/usr/bin/env python3
"""Splitty feedback service.

Listens on a unix socket only (no TCP port); nginx proxies to it. Stdlib only.

  POST /api/feedback           JSON {kind,title,details,version,platform,website}  -> {"ok":true}
       (/splitty/api/feedback is the same route, kept for apps installed before the subdomain move)
  GET  /api/roadmap            public JSON: only items the admin marked planned / doing / done
  GET  /admin/                 triage list (nginx maps a hidden path to this and puts basic auth in front)
  POST /admin/update           set status / priority / note on one item (CSRF token + same-origin check)

Injection posture:
  * SQL: every statement is parameterised, no string-built SQL anywhere.
  * XSS: every stored value is passed through html.escape() before it reaches HTML; the admin page
    ships no JavaScript and a CSP of default-src 'none', so even an escaping bug could not run script.
  * Input: hard length caps, whitelist for `kind`, control characters stripped, strict JSON object only.
  * Abuse: body size cap, honeypot field, per-client hourly cap, global daily cap.
  * Client IPs are stored only as a salted hash.
"""
import hashlib
import hmac
import html
import json
import os
import re
import sqlite3
import sys
import time
import socketserver
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler

SOCK_PATH = os.environ.get('SOCK_PATH', '/run/splitty-feedback/sock')
DATA_DIR = os.environ.get('DATA_DIR', '/var/lib/splitty-feedback')
DB_PATH = os.path.join(DATA_DIR, 'feedback.db')
SALT_PATH = os.path.join(DATA_DIR, 'salt')

MAX_BODY = 8 * 1024
MAX_TITLE, MAX_DETAILS = 120, 2000
PER_CLIENT_PER_HOUR = 5
GLOBAL_PER_DAY = 300
KINDS = ('feature', 'bug')
CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
SAFE_TOKEN = re.compile(r'[^A-Za-z0-9._+-]')

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
}
ADMIN_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
STATUSES = ('new', 'planned', 'doing', 'done', 'declined')
PUBLIC_STATUSES = ('planned', 'doing', 'done')
MAX_NOTE = 500
FEEDBACK_PATHS = ('/api/feedback', '/splitty/api/feedback')


def db():
    con = sqlite3.connect(DB_PATH, timeout=5)
    con.execute(
        'CREATE TABLE IF NOT EXISTS feedback ('
        'id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, kind TEXT NOT NULL, '
        'title TEXT NOT NULL, details TEXT NOT NULL, version TEXT NOT NULL, platform TEXT NOT NULL, '
        'client TEXT NOT NULL)'
    )
    con.execute('CREATE INDEX IF NOT EXISTS idx_feedback_client ON feedback(client, created)')
    cols = {r[1] for r in con.execute('PRAGMA table_info(feedback)')}
    if 'status' not in cols:  # triage columns, added in place so existing rows survive
        con.execute("ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
        con.execute('ALTER TABLE feedback ADD COLUMN priority INTEGER NOT NULL DEFAULT 0')
        con.execute("ALTER TABLE feedback ADD COLUMN note TEXT NOT NULL DEFAULT ''")
        con.commit()
    return con


def salt():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SALT_PATH):
        fd = os.open(SALT_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(os.urandom(32).hex())
    with open(SALT_PATH) as f:
        return f.read().strip()


SALT = salt()


def clean_text(v, limit):
    if not isinstance(v, str):
        return ''
    return CTRL.sub('', v).replace('\r\n', '\n').strip()[:limit]


def clean_token(v, limit):
    if not isinstance(v, str):
        return 'unknown'
    return SAFE_TOKEN.sub('', v)[:limit] or 'unknown'


def client_hash(ip):
    return hashlib.sha256((SALT + ip).encode()).hexdigest()[:16]


def esc(v):
    return html.escape(str(v), quote=True)


def csrf_token():
    return hmac.new(SALT.encode(), b'admin-csrf', hashlib.sha256).hexdigest()


def render_admin(rows, kind, status, sort):
    items = []
    for r in rows:
        (rid, created, k, title, details, version, platform, st, pri, note) = r
        when = time.strftime('%Y-%m-%d %H:%M', time.gmtime(created + 2 * 3600))  # SAST
        st_opts = ''.join('<option%s>%s</option>' % (' selected' if x == st else '', x) for x in STATUSES)
        pr_opts = ''.join('<option value="%d"%s>%d</option>' % (n, ' selected' if n == pri else '', n) for n in range(6))
        items.append(
            '<article class="s-{st}"><header><b class="k {k}">{k}</b> <span>#{id} &middot; {when} SAST &middot; v{v} &middot; {p}</span></header>'
            '<h2>{t}</h2><pre>{d}</pre>'
            '<form method="post" action="update"><input type="hidden" name="csrf" value="{c}"><input type="hidden" name="id" value="{id}">'
            '<label>status <select name="status">{so}</select></label> <label>priority <select name="priority">{po}</select></label> '
            '<input class="note" name="note" maxlength="{mn}" placeholder="private note" value="{n}"> <button>Save</button></form></article>'.format(
                st=esc(st), k=esc(k), id=esc(rid), when=esc(when), v=esc(version), p=esc(platform), t=esc(title),
                d=esc(details), c=esc(csrf_token()), so=st_opts, po=pr_opts, mn=MAX_NOTE, n=esc(note))
        )
    body = ''.join(items) or '<p>Nothing matches.</p>'

    def link(label, k=None, s_=None, so=None):
        q = []
        for key, val in (('kind', k if k is not None else kind), ('status', s_ if s_ is not None else status), ('sort', so or sort)):
            if val:
                q.append('%s=%s' % (key, esc(val)))
        return '<a href="?%s">%s</a>' % ('&amp;'.join(q), esc(label))

    nav = ('<nav>kind: %s %s %s &nbsp; status: %s %s &nbsp; sort: %s %s</nav>' % (
        link('all', k=''), link('feature', k='feature'), link('bug', k='bug'),
        link('all', s_=''), ' '.join(link(x, s_=x) for x in STATUSES),
        link('priority', so='priority'), link('newest', so='new')))
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
        '<title>Splitty triage</title><style>'
        'body{font:15px/1.5 system-ui,sans-serif;background:#0f1115;color:#e8eaed;max-width:800px;margin:0 auto;padding:16px}'
        'a{color:#26c6a0}nav{margin:8px 0 16px;line-height:2}'
        'article{background:#1a1d23;border:1px solid #2a2e36;border-radius:12px;padding:12px 16px;margin:12px 0}'
        'article.s-planned,article.s-doing{border-color:#26c6a0}article.s-done,article.s-declined{opacity:.6}'
        'header span{color:#9aa0a6;font-size:13px}h2{font-size:17px;margin:6px 0}'
        'pre{white-space:pre-wrap;word-break:break-word;margin:0 0 8px;font:inherit;color:#c9ccd1}'
        'form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;color:#9aa0a6}'
        'select,input.note,button{background:#0f1115;color:#e8eaed;border:1px solid #2a2e36;border-radius:8px;padding:5px 8px;font:inherit}'
        'input.note{flex:1;min-width:140px}button{background:#26c6a0;color:#06251d;border:0;font-weight:600}'
        '.k{padding:1px 8px;border-radius:99px;font-size:12px;text-transform:uppercase}'
        '.feature{background:#26c6a0;color:#06251d}.bug{background:#ff6b6b;color:#2b0808}'
        '</style></head><body><h1>Splitty triage</h1><p>%d shown. Items marked planned, doing or done appear on the public roadmap.</p>%s%s</body></html>'
        % (len(rows), nav, body)
    )


class Handler(BaseHTTPRequestHandler):
    server_version = 'splitty-feedback'
    sys_version = ''

    def _send(self, code, body, ctype='application/json', extra=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        for k, v in {**SECURITY_HEADERS, **(extra or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj), 'application/json; charset=utf-8')

    def log_message(self, fmt, *args):  # one terse line, no bodies logged
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/api/roadmap':
            return self._roadmap()
        if u.path != '/admin/':
            return self._json(404, {'ok': False})
        q = parse_qs(u.query)
        kind = q.get('kind', [''])[0]
        status = q.get('status', [''])[0]
        sort = q.get('sort', ['priority'])[0]
        kind = kind if kind in KINDS else ''
        status = status if status in STATUSES else ''
        sort = sort if sort in ('priority', 'new') else 'priority'
        where, args = [], []
        if kind:
            where.append('kind=?'); args.append(kind)
        if status:
            where.append('status=?'); args.append(status)
        order = 'priority DESC, id DESC' if sort == 'priority' else 'id DESC'
        sql = ('SELECT id, created, kind, title, details, version, platform, status, priority, note FROM feedback'
               + (' WHERE ' + ' AND '.join(where) if where else '') + ' ORDER BY ' + order + ' LIMIT 500')  # fixed fragments only
        con = db()
        try:
            rows = con.execute(sql, args).fetchall()
        finally:
            con.close()
        self._send(200, render_admin(rows, kind, status, sort), 'text/html; charset=utf-8', {'Content-Security-Policy': ADMIN_CSP})

    def _roadmap(self):
        con = db()
        try:
            rows = con.execute(
                'SELECT kind, title, status FROM feedback WHERE status IN (?,?,?) ORDER BY priority DESC, id DESC LIMIT 50',
                PUBLIC_STATUSES,
            ).fetchall()
        finally:
            con.close()
        self._send(200, json.dumps({'items': [{'kind': r[0], 'title': r[1], 'status': r[2]} for r in rows]}),
                   'application/json; charset=utf-8', {'Cache-Control': 'public, max-age=300'})

    def _admin_update(self):
        host = (self.headers.get('Host') or '').lower()
        origin = urlparse(self.headers.get('Origin') or '').netloc.lower()
        if not host or origin != host:  # same-origin only: basic auth alone would let another site forge this POST
            return self._json(403, {'ok': False})
        try:
            length = int(self.headers.get('Content-Length') or '')
        except ValueError:
            return self._json(411, {'ok': False})
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {'ok': False})
        form = parse_qs(self.rfile.read(length).decode('utf-8', 'replace'), keep_blank_values=True)
        get = lambda k: (form.get(k) or [''])[0]
        if not hmac.compare_digest(get('csrf'), csrf_token()):
            return self._json(403, {'ok': False})
        status = get('status')
        try:
            rid, pri = int(get('id')), int(get('priority'))
        except ValueError:
            return self._json(400, {'ok': False})
        if status not in STATUSES or not 0 <= pri <= 5:
            return self._json(400, {'ok': False})
        note = clean_text(get('note'), MAX_NOTE)
        con = db()
        try:
            con.execute('UPDATE feedback SET status=?, priority=?, note=? WHERE id=?', (status, pri, note, rid))
            con.commit()
        finally:
            con.close()
        self.send_response(303)
        self.send_header('Location', './')
        self.send_header('Content-Length', '0')
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        path = self.path.split('?')[0]
        if path == '/admin/update':
            return self._admin_update()
        if path not in FEEDBACK_PATHS:
            return self._json(404, {'ok': False})
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            return self._json(415, {'ok': False, 'error': 'JSON only'})
        try:
            length = int(self.headers.get('Content-Length') or '')
        except ValueError:
            return self._json(411, {'ok': False, 'error': 'Length required'})
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {'ok': False, 'error': 'Too large'})
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {'ok': False, 'error': 'Bad JSON'})
        if not isinstance(payload, dict):
            return self._json(400, {'ok': False, 'error': 'Bad JSON'})

        if payload.get('website'):  # honeypot: real users never fill this
            return self._json(200, {'ok': True})

        kind = payload.get('kind')
        title = clean_text(payload.get('title'), MAX_TITLE)
        details = clean_text(payload.get('details'), MAX_DETAILS)
        if kind not in KINDS or len(title) < 3:
            return self._json(422, {'ok': False, 'error': 'A title of at least 3 characters is needed'})
        version = clean_token(payload.get('version'), 20)
        platform = clean_token(payload.get('platform'), 20)

        ip = (self.headers.get('X-Real-IP') or 'unknown')[:64]
        client = client_hash(ip)
        now = int(time.time())
        con = db()
        try:
            hourly = con.execute('SELECT COUNT(*) FROM feedback WHERE client=? AND created>?', (client, now - 3600)).fetchone()[0]
            daily = con.execute('SELECT COUNT(*) FROM feedback WHERE created>?', (now - 86400,)).fetchone()[0]
            if hourly >= PER_CLIENT_PER_HOUR or daily >= GLOBAL_PER_DAY:
                return self._json(429, {'ok': False, 'error': 'Too many submissions, try again later'})
            con.execute(
                'INSERT INTO feedback (created, kind, title, details, version, platform, client) VALUES (?,?,?,?,?,?,?)',
                (now, kind, title, details, version, platform, client),
            )
            con.commit()
        finally:
            con.close()
        self._json(200, {'ok': True})

    def do_PUT(self):
        self._json(405, {'ok': False})

    do_DELETE = do_PATCH = do_PUT


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

    def get_request(self):
        sock, _ = super().get_request()
        return sock, ('unix', 0)


if __name__ == '__main__':
    if os.path.exists(SOCK_PATH):
        os.unlink(SOCK_PATH)
    srv = UnixServer(SOCK_PATH, Handler)
    os.chmod(SOCK_PATH, 0o660)
    srv.serve_forever()
