"""
Utility helpers for FlashVault
"""

import os
import pathlib
import datetime
import threading
from config import SHARED_DIR, STORAGE_QUOTA


# Storage accounting
# Tracks total bytes currently stored inside SHARED_DIR.
# Initialized once at startup and updated on upload/delete.
_USED_SPACE = 0
_LOCK = threading.Lock()


def init_storage():
    """Scan disk once at startup to initialize used space."""
    global _USED_SPACE
    _USED_SPACE = sum(
        f.stat().st_size
        for f in pathlib.Path(SHARED_DIR).rglob('*')
        if f.is_file()
    )


def add_used_space(size: int):
    """Increase used space counter (thread-safe)."""
    global _USED_SPACE
    with _LOCK:
        _USED_SPACE += size


def remove_used_space(size: int):
    """Decrease used space counter (never below zero)."""
    global _USED_SPACE
    with _LOCK:
        _USED_SPACE = max(_USED_SPACE - size, 0)


def get_free_space() -> int:
    """Return remaining free space in bytes (O(1))."""
    return max(STORAGE_QUOTA - _USED_SPACE, 0)


# Helpers
def human_size(size: int) -> str:
    """Convert bytes to human-readable form."""
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def get_safe_path(subpath: str = '') -> str:
    """Resolve and restrict paths to SHARED_DIR (path traversal safe)."""
    base = pathlib.Path(SHARED_DIR).resolve()
    target = (base / subpath).resolve()
    try:
        target.relative_to(base)
        return str(target)
    except ValueError:
        return str(base)


def list_files(current_path: str) -> list[dict]:
    """Return sorted list of files/folders in a directory."""
    items = []
    for entry in sorted(
        pathlib.Path(current_path).iterdir(),
        key=lambda x: (x.is_file(), x.name.lower())
    ):
        stat = entry.stat()
        items.append({
            'name': entry.name,
            'path': os.path.relpath(entry, SHARED_DIR),
            'is_file': entry.is_file(),
            'size': human_size(stat.st_size) if entry.is_file() else '',
            'mtime': datetime.datetime.fromtimestamp(
                stat.st_mtime
            ).strftime('%Y-%m-%d %H:%M:%S')
        })
    return items


def get_breadcrumbs(current_path: str) -> list[dict]:
    """Build breadcrumb navigation from SHARED_DIR."""
    rel_path = os.path.relpath(current_path, SHARED_DIR)
    if rel_path == '.':
        return []

    breadcrumbs = []
    current = ''
    for part in rel_path.split(os.sep):
        current = os.path.join(current, part) if current else part
        breadcrumbs.append({'name': part, 'path': current})
    return breadcrumbs
