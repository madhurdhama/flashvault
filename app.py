"""FlashVault"""

import sys
import os
import shutil
import logging
import werkzeug
from flask import Flask, render_template, send_from_directory, request, jsonify
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge, ClientDisconnected

sys.dont_write_bytecode = True

from config import SHARED_DIR, HOST, PORT, MAX_CONTENT_LENGTH, SECRET_KEY
from utils import (
    human_size,
    get_safe_path,
    list_files,
    get_breadcrumbs,
    get_free_space,
    get_item_info,
)


logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

logging.getLogger('werkzeug').setLevel(logging.ERROR)

os.makedirs(SHARED_DIR, exist_ok=True)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.secret_key = SECRET_KEY

# HTTP/1.0 closes the connection after each request, which breaks
# large file transfers — force 1.1 so keep-alive works
werkzeug.serving.WSGIRequestHandler.protocol_version = "HTTP/1.1"


@app.route('/')
@app.route('/browse/')
@app.route('/browse/<path:subpath>')
def browse(subpath=''):
    current_path = get_safe_path(subpath)
    files = list_files(current_path)

    page = request.args.get('page', 1, type=int)
    per_page = 50
    start = (page - 1) * per_page

    n_files   = sum(1 for f in files if f['is_file'])
    n_folders = sum(1 for f in files if not f['is_file'])

    return render_template(
        'index.html',
        files=files[start:start + per_page],
        count=len(files),
        n_files=n_files,
        n_folders=n_folders,
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

    logger.info(f"Downloaded: {filepath}")
    return send_from_directory(
        os.path.dirname(full_path),
        os.path.basename(full_path),
        as_attachment=True
    )


@app.route('/preview/<path:filepath>')
def preview(filepath):
    full_path = get_safe_path(filepath)

    if not os.path.isfile(full_path):
        return jsonify({'error': 'File not found'}), 404

    # as_attachment=False so the browser shows it instead of downloading
    return send_from_directory(
        os.path.dirname(full_path),
        os.path.basename(full_path),
        as_attachment=False
    )


@app.route('/delete/<path:filepath>', methods=['POST'])
def delete(filepath):
    # one route for both — branches below on file vs folder
    try:
        full_path = get_safe_path(filepath)

        if not os.path.exists(full_path):
            return jsonify({'success': False, 'error': 'Not found'}), 404

        # refuse to delete SHARED_DIR itself
        if os.path.abspath(full_path) == os.path.abspath(SHARED_DIR):
            return jsonify({'success': False, 'error': 'Cannot delete root'}), 403

        if os.path.isfile(full_path):
            os.remove(full_path)
            logger.info(f"Deleted file: {filepath}")
        elif os.path.isdir(full_path):
            shutil.rmtree(full_path)
            logger.info(f"Deleted folder: {filepath}")
        else:
            return jsonify({'success': False, 'error': 'Unknown item type'}), 400

        return jsonify({'success': True})

    except Exception:
        logger.exception("Delete error")
        return jsonify({'success': False, 'error': 'Delete failed'}), 500


@app.route('/mkdir', methods=['POST'])
def mkdir():
    try:
        data = request.get_json(silent=True) or {}
        parent = data.get('path', '')
        name = data.get('name', '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Folder name required'}), 400

        safe_name = secure_filename(name)
        if not safe_name:
            return jsonify({'success': False, 'error': 'Invalid folder name'}), 400

        parent_path = get_safe_path(parent)
        new_folder = os.path.join(parent_path, safe_name)

        if os.path.exists(new_folder):
            return jsonify({'success': False, 'error': 'Folder already exists'}), 409

        os.makedirs(new_folder)
        logger.info(f"Created folder: {safe_name}")
        return jsonify({'success': True})

    except Exception:
        logger.exception("Mkdir error")
        return jsonify({'success': False, 'error': 'Failed to create folder'}), 500


@app.route('/rename', methods=['POST'])
def rename():
    try:
        data = request.get_json(silent=True) or {}
        old_path = data.get('path', '')
        new_name = data.get('name', '').strip()

        if not new_name:
            return jsonify({'success': False, 'error': 'New name required'}), 400

        safe_name = secure_filename(new_name)
        if not safe_name:
            return jsonify({'success': False, 'error': 'Invalid name'}), 400

        full_old = get_safe_path(old_path)
        if not os.path.exists(full_old):
            return jsonify({'success': False, 'error': 'Item not found'}), 404

        full_new = os.path.join(os.path.dirname(full_old), safe_name)
        if os.path.exists(full_new):
            return jsonify({'success': False, 'error': 'Name already taken'}), 409

        os.rename(full_old, full_new)
        logger.info(f"Renamed: {old_path} → {safe_name}")
        return jsonify({'success': True})

    except Exception:
        logger.exception("Rename error")
        return jsonify({'success': False, 'error': 'Rename failed'}), 500


@app.route('/info/<path:itempath>')
def info(itempath):
    try:
        full_path = get_safe_path(itempath)
        if not os.path.exists(full_path):
            return jsonify({'error': 'Not found'}), 404
        return jsonify(get_item_info(full_path))
    except Exception:
        logger.exception("Info error")
        return jsonify({'error': 'Failed to get info'}), 500


@app.route('/storage-check', methods=['POST'])
def storage_check():
    try:
        data = request.get_json(silent=True) or {}
        size = int(data.get('size', 0))
        size = min(max(size, 0), MAX_CONTENT_LENGTH)
        free = get_free_space()
        return jsonify({'available': free > size, 'free': free})
    except Exception:
        return jsonify({'available': False, 'free': 0}), 400


@app.route('/upload', methods=['POST'])
def upload():
    # writes to filename.part first, only renamed once fully written
    temp_path = None

    try:
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

        temp_path = filepath + '.part'
        with open(temp_path, 'wb') as f:
            while True:
                chunk = request.stream.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        written_size = os.path.getsize(temp_path)
        if get_free_space() < written_size:
            os.remove(temp_path)
            return jsonify({'error': 'Insufficient disk space'}), 507

        os.replace(temp_path, filepath)
        temp_path = None
        logger.info(f"✓ {filename}")
        return jsonify({'success': True})

    except ClientDisconnected:
        logger.info("Upload cancelled by client")
        return jsonify({'error': 'Upload cancelled'}), 499
    except RequestEntityTooLarge:
        return jsonify({
            'error': f'File too large — maximum upload size is {human_size(MAX_CONTENT_LENGTH)}'
        }), 413
    except OSError as e:
        logger.error(f"Storage error: {e}")
        free = get_free_space()
        return jsonify({
            'error': f'Insufficient disk space — {human_size(free)} available'
        }), 507
    except Exception:
        logger.exception("Upload failed")
        return jsonify({'error': 'Upload failed'}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.errorhandler(413)
def request_too_large(e):
    # werkzeug rejects this before our route runs, so the json reply
    # has to come from an error handler instead of the route itself
    limit = human_size(MAX_CONTENT_LENGTH)
    return jsonify({
        'error': f'File too large — maximum upload size is {limit}'
    }), 413


if __name__ == '__main__':
    import socket
    try:
        # no packet actually goes out, this just asks the OS which
        # network interface it would use
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.254.254.254', 1))
            lan_ip = s.getsockname()[0]
    except Exception:
        lan_ip = '127.0.0.1'
    logger.info(f"Serving files from: {SHARED_DIR}")
    logger.info(f"Network: http://{lan_ip}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True, debug=False)