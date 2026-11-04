"""Map synthetic replay time to real calendar dates.

Synthetic networks count seconds from 00:00 on day 1, a Monday. For display, day 1 is placed
on the Monday of last week, so a replayed attack reads like logs from the past few days.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta


def replay_base(today: date | None = None) -> datetime:
    today = today or date.today()
    this_monday = today - timedelta(days=today.weekday())
    return datetime.combine(this_monday - timedelta(days=7), datetime.min.time())


def stamp(seconds: int, base: datetime | None = None) -> datetime:
    """Synthetic seconds -> calendar datetime."""
    return (base or replay_base()) + timedelta(seconds=int(seconds))
