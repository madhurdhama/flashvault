"""
Utility helpers for FlashVault
"""

import os
import pathlib
import datetime
import shutil
from config import SHARED_DIR, MIN_FREE_SPACE


def get_free_space() -> int:
    """Return available disk space (minus MIN_FREE_SPACE buffer)."""
    try:
        stat = shutil.disk_usage(SHARED_DIR)
        return max(stat.free - MIN_FREE_SPACE, 0)
    except Exception:
        return 0


def human_size(size: int) -> str:
    """Convert bytes to human-readable form."""
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def get_safe_path(subpath: str = '') -> str:
    """Resolve and restrict paths to SHARED_DIR (prevents path traversal)."""
    base = pathlib.Path(SHARED_DIR).resolve()
    target = (base / subpath).resolve()
    try:
        target.relative_to(base)
        return str(target)
    except ValueError:
        return str(base)


def list_files(current_path: str) -> list[dict]:
    """Return sorted list of files/folders (folders first, then alphabetical)."""
    items = []
    try:
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
    except (PermissionError, FileNotFoundError):
        pass
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