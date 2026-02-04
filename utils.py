"""
Utility helpers for FlashVault
"""
import os
import pathlib
import datetime
from config import SHARED_DIR, STORAGE_QUOTA

def human_size(size):
    """Convert bytes to human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"

def get_safe_path(subpath=''):
    """Return a safe absolute path inside the shared directory."""
    base = pathlib.Path(SHARED_DIR).resolve()
    target = (base / subpath).resolve()
    try:
        target.relative_to(base)
        return str(target)
    except ValueError:
        return str(base)

def list_files(current_path):
    """Return sorted list of files and folders in a directory."""
    items = []
    for entry in sorted(pathlib.Path(current_path).iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        stat = entry.stat()
        items.append({
            'name': entry.name,
            'path': os.path.relpath(entry, SHARED_DIR),
            'is_file': entry.is_file(),
            'size': human_size(stat.st_size) if entry.is_file() else '',
            'mtime': datetime.datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        })
    return items

def get_breadcrumbs(current_path):
    """Build breadcrumb navigation paths."""
    rel_path = os.path.relpath(current_path, SHARED_DIR)
    if rel_path == '.':
        return []
    breadcrumbs = []
    current = ''
    for part in rel_path.split(os.sep):
        current = os.path.join(current, part) if current else part
        breadcrumbs.append({'name': part, 'path': current})
    return breadcrumbs

def get_free_space():
    """Return remaining storage space in bytes."""
    used = sum(
        f.stat().st_size
        for f in pathlib.Path(SHARED_DIR).rglob('*')
        if f.is_file()
    )
    return max(STORAGE_QUOTA - used, 0)