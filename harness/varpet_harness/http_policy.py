"""Shared policy for the loopback services behind the trusted Cloudflare tunnel."""
import ipaddress
import os
import threading
import time
from collections import deque
from urllib.parse import urlsplit


def public_origin():
    value = os.environ.get('VARPET_PUBLIC_ORIGIN', '')
    if not value:
        return None
    parsed = urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
            or value != f'{parsed.scheme}://{parsed.netloc}'):
        raise ValueError('VARPET_PUBLIC_ORIGIN must be an exact HTTP(S) origin without a path')
    return value


def origin_allowed(origin, local_pattern):
    return origin is None or bool(local_pattern.fullmatch(origin)) or origin == public_origin()


def client_ip(handler):
    # These services must remain loopback-only: only the tunnel is trusted to set this header.
    forwarded = handler.headers.get('CF-Connecting-IP', '')
    try:
        return str(ipaddress.ip_address(forwarded))
    except ValueError:
        return getattr(handler, 'client_address', ('127.0.0.1', 0))[0]


class HourlyLimit:
    """Atomic sliding window, shared by all request threads; idle keys are reaped."""
    def __init__(self, env, default, clock=time.monotonic):
        self.maximum = int(os.environ.get(env, str(default)))
        if self.maximum < 1:
            raise ValueError(f'{env} must be a positive integer')
        self.clock = clock
        self.lock = threading.Lock()
        self.events = {}

    def allow(self, client):
        with self.lock:
            now = self.clock()
            for key in list(self.events):
                queue = self.events[key]
                while queue and queue[0] <= now - 3600:
                    queue.popleft()
                if not queue:
                    del self.events[key]
            queue = self.events.get(client)
            # Bound memory without evicting active clients and resetting their quotas.
            if queue is None:
                if len(self.events) >= 10000:
                    return False
                queue = self.events[client] = deque()
            if len(queue) >= self.maximum:
                return False
            queue.append(now)
            return True
