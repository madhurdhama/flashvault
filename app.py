"""
FlashVault - Main Application

DEPLOYMENT NOTE:
Single-process deployment only.

Safe:
- python3 app.py
- gunicorn -w 1 -k gthread ...

Not safe:
- gunicorn -w > 1

Reason:
Storage quota tracking uses an in-memory counter that is not shared
across processes. Multi-worker deployments will break quota enforcement.

For multi-process deployments, a shared backend (Redis/database) is required.
"""

import sys
import os
import logging
import werkzeug
from flask import Flask, render_template, send_from_directory, request, jsonify
from werkzeug.utils import secure_filename

sys.dont_write_bytecode = True  # Prevent __pycache__

from config import SHARED_DIR, HOST, PORT, MAX_CONTENT_LENGTH, SECRET_KEY
from utils import (
    human_size,
    get_safe_path,
    list_files,
    get_breadcrumbs,
    get_free_space,
    init_storage,
    add_used_space,
    remove_used_space
)


# App setup
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

os.makedirs(SHARED_DIR, exist_ok=True)
init_storage()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.secret_key = SECRET_KEY
werkzeug.serving.WSGIRequestHandler.protocol_version = "HTTP/1.1"


# Routes
@app.route('/')
@app.route('/browse/')
@app.route('/browse/<path:subpath>')
def browse(subpath=''):
    current_path = get_safe_path(subpath)
    files = list_files(current_path)

    page = request.args.get('page', 1, type=int)
    per_page = 50
    start = (page - 1) * per_page

    return render_template(
        'index.html',
        files=files[start:start + per_page],
        count=len(files),
        breadcrumbs=get_breadcrumbs(current_path),
        current_subpath=subpath,
        storage_left=human_size(get_free_space()),
        page=page,
        total_pages=(len(files) + per_page - 1) // per_page
    )


@app.route('/download/<path:filepath>')
def download(filepath):
    full_path = get_safe_path(filepath)

    if not os.path.isfile(full_path):
        return jsonify({'error': 'File not found'}), 404

    return send_from_directory(
        os.path.dirname(full_path),
        os.path.basename(full_path),
        as_attachment=True
    )


@app.route('/delete/<path:filepath>', methods=['POST'])
def delete(filepath):
    try:
        full_path = get_safe_path(filepath)

        if not os.path.isfile(full_path):
            return jsonify({'success': False, 'error': 'Not a file'}), 400

        size = os.path.getsize(full_path)
        os.remove(full_path)
        remove_used_space(size)

        logger.info(f"Deleted: {filepath}")
        return jsonify({'success': True})

    except Exception:
        logger.exception("Delete error")
        return jsonify({'success': False, 'error': 'Delete failed'}), 500


@app.route('/storage-check', methods=['POST'])
def storage_check():
    try:
        data = request.get_json(silent=True) or {}
        size = int(data.get('size', 0))
        free = get_free_space()
        return jsonify({'available': free > size, 'free': free})
    
    except Exception:
        return jsonify({'available': False, 'free': 0, 'error': 'Invalid request'}), 400


@app.route('/upload', methods=['POST'])
def upload():
    temp_path = None
    try:
        # Fast quota check (early reject)
        content_length = request.content_length or 0
        if content_length > 0 and get_free_space() < content_length:
            return jsonify({'error': 'Storage quota exceeded'}), 507

        upload_dir = get_safe_path(request.headers.get('X-Upload-Path', ''))
        os.makedirs(upload_dir, exist_ok=True)

        raw_name = request.headers.get('X-Filename')
        if not raw_name:
            return jsonify({'error': 'Filename header missing'}), 400

        filename = secure_filename(raw_name)
        if not filename:
            return jsonify({'error': 'Invalid filename'}), 400

        filepath = os.path.join(upload_dir, filename)
        if os.path.exists(filepath):
            return jsonify({'error': 'File already exists'}), 409

        # Stream upload to temp file
        temp_path = filepath + '.part'
        with open(temp_path, 'wb') as f:
            while True:
                chunk = request.stream.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        written_size = os.path.getsize(temp_path)

        # Final quota check (race-safe)
        if get_free_space() < written_size:
            os.remove(temp_path)
            return jsonify({'error': 'Storage quota exceeded'}), 507

        os.replace(temp_path, filepath)  # atomic
        temp_path = None
        add_used_space(written_size)

        logger.info(f"✓ {filename}")
        return jsonify({'success': True})

    except Exception:
        logger.exception("Upload failed")
        return jsonify({'error': 'Upload failed'}), 500

    finally:
        # Cleanup .part file on failure
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


if __name__ == '__main__':
    logger.info(f"Serving files from: {SHARED_DIR}")
    logger.info(f"Access server at: http://<your-ip>:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True, debug=False)