"""Offline fixtures, not a Home Assistant runtime or an aiohttp implementation."""

import asyncio
import importlib
import json
import sys
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType

COMPONENT = Path(__file__).resolve().parents[1] / "custom_components" / "hearth"
PACKAGE = "_hearth_bridge_offline"
if PACKAGE not in sys.modules:
    package = ModuleType(PACKAGE)
    package.__path__ = [str(COMPONENT)]
    sys.modules[PACKAGE] = package


def module(name):
    # Skip HA's __init__; client and date helpers depend only on the stdlib.
    return importlib.import_module(f"{PACKAGE}.{name}")


client = module("client")
KEY = "ha_" + "A" * 43  # Synthetic fixture, never a real credential.


def command(status="pending", tab="chores", *, command_id="command_one"):
    now = datetime.now(UTC)
    return {
        "id": command_id,
        "tab": tab,
        "status": status,
        "createdAt": now.isoformat(),
        "expiresAt": (now + timedelta(seconds=30)).isoformat(),
    }


def state(tab="today", *, observed=None):
    now = datetime.now(UTC).isoformat()
    return {
        "version": 1,
        "generatedAt": now,
        "household": {
            "id": "household_demo",
            "name": "Demo family",
            "timezone": "Australia/Perth",
        },
        "permissions": {
            "shareChores": True,
            "shareCalendar": True,
            "controlChores": False,
        },
        "screens": [
            {
                "id": "screen_kitchen",
                "name": "Kitchen",
                "online": True,
                "currentTab": tab,
                "lastSeenAt": now,
                "command": deepcopy(observed),
            }
        ],
        "chores": {
            "localDate": "2026-10-15",
            "open": 3,
            "completed": 2,
            "truncated": False,
            "items": [
                {
                    "id": "chore_demo",
                    "title": "Feed the dog",
                    "assignee": "Alex",
                    "state": "pending",
                    "completionId": None,
                    "locked": False,
                }
            ],
        },
        "calendar": {"freshness": "current", "events": []},
    }


def event(*, event_id="event_one", all_day=False):
    return {
        "id": event_id,
        "title": "Family event",
        "allDay": all_day,
        "start": "2026-10-14T16:00:00Z",
        "end": "2026-10-15T16:00:00Z",
        "startLocalDate": "2026-10-15",
        "endLocalDate": "2026-10-16" if all_day else "2026-10-15",
    }


class Response:
    def __init__(
        self,
        value=None,
        *,
        status=200,
        raw=None,
        content_type="application/json",
        headers=None,
        content_length=None,
        delay=0,
    ):
        self.status = status
        self.body = json.dumps(value).encode() if raw is None else raw
        self.content_type = content_type
        self.headers = headers or {}
        self.content_length = content_length
        self.content = self
        self.delay = delay

    async def __aenter__(self):
        if self.delay:
            await asyncio.sleep(self.delay)
        return self

    async def __aexit__(self, *args):
        return False

    async def iter_chunked(self, size):
        for offset in range(0, len(self.body), size):
            yield self.body[offset : offset + size]


class Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, deepcopy(kwargs)))
        if not self.responses:
            raise AssertionError("Unexpected HTTP request in offline fixture")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def make_client(session, **kwargs):
    return client.HearthClient(session, "https://hearth.invalid", KEY, **kwargs)
