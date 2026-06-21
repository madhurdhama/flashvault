"""helpers used by app.py — no flask imports here"""

import os
import mimetypes
import pathlib
import datetime
import shutil
from config import SHARED_DIR, MIN_FREE_SPACE


def get_free_space() -> int:
    try:
        stat = shutil.disk_usage(SHARED_DIR)
        return max(stat.free - MIN_FREE_SPACE, 0)
    except Exception:
        return 0


def human_size(size: int) -> str:
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def get_safe_path(subpath: str = '') -> str:
    # blocks ../.. tricks — resolved path has to stay inside SHARED_DIR
    base = pathlib.Path(SHARED_DIR).resolve()
    target = (base / subpath).resolve()
    try:
        target.relative_to(base)
        return str(target)
    except ValueError:
        return str(base)


def get_dir_info(path: pathlib.Path) -> tuple[int, int]:
    # recursive, so only use for the info panel, not the main file listing
    total_size = 0
    file_count = 0
    try:
        for entry in path.rglob('*'):
            if entry.is_file():
                total_size += entry.stat().st_size
                file_count += 1
    except (PermissionError, FileNotFoundError):
        pass
    return total_size, file_count


def list_files(current_path: str) -> list[dict]:
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


def get_item_info(full_path: str) -> dict:
    p = pathlib.Path(full_path)
    stat = p.stat()
    is_file = p.is_file()

    info = {
        'name': p.name,
        'path': os.path.relpath(full_path, SHARED_DIR),
        'is_file': is_file,
        'created': datetime.datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S'),
        'modified': datetime.datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
    }

    if is_file:
        info['size'] = human_size(stat.st_size)
        info['size_bytes'] = stat.st_size
        mime, _ = mimetypes.guess_type(p.name)
        info['mime'] = mime or 'application/octet-stream'
        info['extension'] = p.suffix.lstrip('.').upper() or 'File'
    else:
        # size is recursive (whole folder), but item/folder/file counts
        # below are direct children only — these intentionally don't match
        total_size, _ = get_dir_info(p)
        info['size'] = human_size(total_size)
        info['size_bytes'] = total_size
        try:
            children = list(p.iterdir())
            folders = [c for c in children if c.is_dir()]
            files   = [c for c in children if c.is_file()]
            info['item_count']   = len(children)
            info['folder_count'] = len(folders)
            info['file_count']   = len(files)
        except Exception:
            info['item_count']   = 0
            info['folder_count'] = 0
            info['file_count']   = 0

    return info


def get_breadcrumbs(current_path: str) -> list[dict]:
    rel_path = os.path.relpath(current_path, SHARED_DIR)
    if rel_path == '.':
        return []

    breadcrumbs = []
    current = ''
    for part in rel_path.split(os.sep):
        current = os.path.join(current, part) if current else part
        breadcrumbs.append({'name': part, 'path': current})
    return breadcrumbs
