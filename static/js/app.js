// --- Upload elements ---
const form        = document.getElementById('uploadForm');
const fileInput   = document.getElementById('fileInput');
const progress    = document.getElementById('progressContainer');
const bar         = document.getElementById('progressBar');
const pctLabel    = document.getElementById('progressPercent');
const nameLabel   = document.getElementById('progressLabel');
const timeLabel   = document.getElementById('progressTime');
const uploadLabel = document.getElementById('uploadLabel');

// --- State ---
let startTime      = 0;
let uploading      = false;
let activeMenuCard = null;
let dialogMode     = null; // 'mkdir' | 'rename'
let renameTarget   = null;
let _deleteTarget  = null;
let _currentXhr    = null;

// upload
fileInput.onchange = () => fileInput.files.length && uploadFiles();
form.onsubmit = (e) => e.preventDefault();

window.addEventListener('scroll', () => {
    if (!uploading) return;
    const uploadBottom = document.querySelector('.upload').getBoundingClientRect().bottom;
    progress.classList.toggle('sticky', uploadBottom < 0);
}, { passive: true });

window.addEventListener('beforeunload', (e) => {
    if (uploading) { e.preventDefault(); e.returnValue = 'Upload in progress!'; }
});

const dropZone = document.body;
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) { fileInput.files = files; uploadFiles(); }
});

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // keep this number in sync with config.py

async function uploadFiles() {
    const files = [...fileInput.files];
    const total = files.reduce((sum, f) => sum + f.size, 0);

    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`"${file.name}" is ${humanSize(file.size)} — max is ${humanSize(MAX_FILE_SIZE)}`, 'error');
            fileInput.value = '';
            return;
        }
    }

    const check = await fetch('/storage-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: total })
    }).then(r => r.json()).catch(() => ({ available: false, free: 0 }));

    if (!check.available) {
        showToast(`Not enough space — need ${humanSize(total)}, only ${humanSize(check.free)} free`, 'error');
        fileInput.value = '';
        return;
    }

    startTime = Date.now();
    uploading = true;
    progress.classList.add('show');
    fileInput.disabled = true;
    uploadLabel.classList.add('disabled');
    lockNav(true);

    // one file at a time, not parallel — keeps the progress bar accurate
    let uploaded = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const currentPath = form.querySelector('[name="current_path"]').value;
        if (!await uploadSingle(file, currentPath, uploaded, total, i + 1, files.length)) {
            resetUpload(); return;
        }
        uploaded += file.size;
    }

    bar.style.width = pctLabel.textContent = '100%';
    nameLabel.textContent = 'Complete!';
    uploading = false;
    progress.classList.remove('sticky');
    setTimeout(() => location.reload(), 500);
}

function uploadSingle(file, currentPath, uploaded, total, index, count) {
    return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        _currentXhr = xhr;
        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const percent = Math.round((uploaded + e.loaded) / total * 100);
            bar.style.width = pctLabel.textContent = percent + '%';
            nameLabel.textContent = count === 1 ? file.name : `${index}/${count}: ${file.name}`;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 1) {
                const speed = (uploaded + e.loaded) / elapsed;
                timeLabel.textContent = formatTime((total - uploaded - e.loaded) / speed) + ' left';
            }
        };
        xhr.onload = () => {
            if (xhr.status === 200) return resolve(true);
            let msg = null;
            try { msg = JSON.parse(xhr.responseText).error; } catch {}
            if (!msg) {
                if (xhr.status === 413) msg = `File too large — max is ${humanSize(MAX_FILE_SIZE)}`;
                else if (xhr.status === 409) msg = `"${file.name}" already exists`;
                else if (xhr.status === 507) msg = 'Insufficient disk space';
                else msg = `Upload failed (${xhr.status})`;
            }
            showToast(msg, 'error');
            resolve(false);
        };
        xhr.onabort = () => resolve(false);
        xhr.onerror = () => {
            const msg = file.size > MAX_FILE_SIZE * 0.95
                ? `File too large — max is ${humanSize(MAX_FILE_SIZE)}`
                : 'Network error — upload failed';
            showToast(msg, 'error');
            resolve(false);
        };
        xhr.open('POST', '/upload');
        xhr.setRequestHeader('X-Filename', file.name);
        xhr.setRequestHeader('X-Upload-Path', currentPath);
        xhr.send(file);
    });
}

function resetUpload() {
    uploading = false;
    progress.classList.remove('show', 'sticky');
    fileInput.disabled = false;
    uploadLabel.classList.remove('disabled');
    fileInput.value = '';
    bar.style.width = '0'; pctLabel.textContent = '0%';
    nameLabel.textContent = ''; timeLabel.textContent = '';
    lockNav(false);
}

function cancelUpload() {
    if (!uploading) return;
    if (_currentXhr) { _currentXhr.abort(); _currentXhr = null; }
    resetUpload();
    showToast('Upload cancelled', 'warn');
}

// Lock breadcrumb nav during upload
function lockNav(lock) {
    document.querySelectorAll('.breadcrumb-link').forEach(a => {
        if (lock) {
            a.dataset.href = a.href;
            a.href = 'javascript:void(0)';
            a.classList.add('nav-locked');
            a.onclick = () => showToast('Upload in progress — please wait.', 'warn');
        } else {
            if (a.dataset.href) a.href = a.dataset.href;
            a.classList.remove('nav-locked');
            a.onclick = null;
        }
    });
}

// card navigation
function handleFolderClick(e, path) {
    if (uploading) { showToast('Upload in progress — please wait.', 'warn'); return; }
    location.href = '/browse/' + path;
}

function handleFileClick(e, card, path) {
    const name = card.dataset.name;
    openPreview(path, name);
}

// context menu
function openMenu(e, btn) {
    e.stopPropagation();
    const card = btn.closest('.card');
    activeMenuCard = card;
    const isFile = card.dataset.isFile === 'true';

    document.getElementById('menuOpen').style.display     = isFile ? 'none' : '';
    document.getElementById('menuPreview').style.display  = isFile ? '' : 'none';
    document.getElementById('menuDownload').style.display = isFile ? '' : 'none';

    const menu = document.getElementById('contextMenu');
    const rect = btn.getBoundingClientRect();
    menu.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px'; // keep menu on-screen
    menu.classList.add('open');
}

function closeMenu() {
    document.getElementById('contextMenu').classList.remove('open');
    activeMenuCard = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#contextMenu') && !e.target.closest('.menu-btn')) closeMenu();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); closeDialog(); closeInfo(); closeDeleteModal(); closePreview(); }
});

function menuAction(action) {
    if (!activeMenuCard) return;
    const path   = activeMenuCard.dataset.path;
    const name   = activeMenuCard.dataset.name;
    const isFile = activeMenuCard.dataset.isFile === 'true';
    closeMenu();
    switch (action) {
        case 'open':      location.href = '/browse/' + path; break;
        case 'preview':   openPreview(path, name); break;
        case 'download':  triggerDownload('/download/' + encodeURIComponent(path)); break;
        case 'rename':    showRenameDialog(path, name); break;
        case 'info':      showInfo(path); break;
        case 'delete':    showDeleteModal(path, name, isFile); break;
    }
}

function triggerDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
}

// delete modal
function showDeleteModal(path, name, isFile) {
    _deleteTarget = { path, name, isFile };
    document.getElementById('deleteModalTitle').textContent = isFile ? 'Delete File' : 'Delete Folder';
    document.getElementById('deleteModalBody').innerHTML =
        `<strong>${escHtml(name)}</strong> will be permanently deleted.` +
        (isFile ? '' : ' This includes all files and subfolders inside it.');
    document.getElementById('deleteOverlay').classList.add('open');
}

function closeDeleteModal() {
    document.getElementById('deleteOverlay').classList.remove('open');
    _deleteTarget = null;
}

function confirmDeleteModal() {
    if (!_deleteTarget) return;
    const { path, name, isFile } = _deleteTarget;
    closeDeleteModal();
    fetch(`/delete/${encodeURIComponent(path)}`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showToast(`"${name}" deleted`, 'warn');
                setTimeout(() => { if (!uploading) location.reload(); }, 700);
            } else {
                showToast(data.error || 'Delete failed', 'error');
            }
        })
        .catch(() => showToast('Delete failed', 'error'));
}

// new folder / rename dialog
function showNewFolderDialog() {
    if (uploading) { showToast('Upload in progress — please wait.', 'warn'); return; }
    dialogMode = 'mkdir';
    renameTarget = null;
    document.getElementById('dialogTitle').textContent = 'New Folder';
    document.getElementById('dialogConfirm').textContent = 'Create';
    document.getElementById('dialogInput').value = '';
    document.getElementById('dialogInput').placeholder = 'Folder name';
    document.getElementById('dialogOverlay').classList.add('open');
    setTimeout(() => document.getElementById('dialogInput').focus(), 50);
}

function showRenameDialog(path, name) {
    dialogMode = 'rename';
    renameTarget = { path, name };
    document.getElementById('dialogTitle').textContent = 'Rename';
    document.getElementById('dialogConfirm').textContent = 'Rename';
    document.getElementById('dialogInput').value = name;
    document.getElementById('dialogInput').placeholder = 'New name';
    document.getElementById('dialogOverlay').classList.add('open');
    setTimeout(() => {
        const inp = document.getElementById('dialogInput');
        inp.focus();
        const dot = name.lastIndexOf('.');
        inp.setSelectionRange(0, dot > 0 ? dot : name.length);
    }, 50);
}

function closeDialog() {
    document.getElementById('dialogOverlay').classList.remove('open');
    dialogMode = null;
    renameTarget = null;
}

document.getElementById('dialogInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmDialog();
    if (e.key === 'Escape') closeDialog();
});

async function confirmDialog() {
    const val = document.getElementById('dialogInput').value.trim();
    if (!val) return;
    if (dialogMode === 'mkdir') {
        const currentPath = form.querySelector('[name="current_path"]').value;
        const res = await fetch('/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, name: val })
        }).then(r => r.json()).catch(() => ({ success: false, error: 'Request failed' }));
        if (!res.success) { showToast(res.error || 'Failed to create folder', 'error'); return; }
        showToast(`Folder "${val}" created`, 'warn');
    } else if (dialogMode === 'rename') {
        const res = await fetch('/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: renameTarget.path, name: val })
        }).then(r => r.json()).catch(() => ({ success: false, error: 'Request failed' }));
        if (!res.success) { showToast(res.error || 'Rename failed', 'error'); return; }
        showToast(`Renamed to "${val}"`, 'warn');
    }
    closeDialog();
    setTimeout(() => location.reload(), 500);
}

// info panel
async function showInfo(path) {
    const overlay = document.getElementById('infoOverlay');
    document.getElementById('infoName').textContent = '…';
    document.getElementById('infoType').textContent = '';
    document.getElementById('infoRows').innerHTML = '<div class="info-loading">Loading…</div>';
    overlay.classList.add('open');

    const data = await fetch('/info/' + encodeURIComponent(path))
        .then(r => r.json()).catch(() => null);

    if (!data || data.error) {
        document.getElementById('infoRows').innerHTML = '<div class="info-loading">Failed to load info.</div>';
        return;
    }

    document.getElementById('infoName').textContent = data.name;
    document.getElementById('infoType').textContent = data.is_file ? (data.extension || 'File') : 'Folder';
    document.getElementById('infoIcon').innerHTML = data.is_file
        ? `<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`
        : `<svg width="28" height="28" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

    const rows = [['Size', data.size]];
    if (data.is_file) {
        rows.push(['Type', data.mime]);
        rows.push(['Extension', data.extension ? '.' + data.extension.toLowerCase() : '—']);
    } else {
        const fCount = data.file_count, dCount = data.folder_count;
        let s = data.item_count + ' item' + (data.item_count !== 1 ? 's' : '');
        const parts = [];
        if (dCount > 0) parts.push(dCount + ' folder' + (dCount !== 1 ? 's' : ''));
        if (fCount > 0) parts.push(fCount + ' file' + (fCount !== 1 ? 's' : ''));
        if (parts.length) s += ' (' + parts.join(', ') + ')';
        rows.push(['Contents', s]);
    }
    rows.push(['Modified', data.modified]);
    rows.push(['Created', data.created]);
    rows.push(['Path', '/' + data.path]);

    document.getElementById('infoRows').innerHTML = rows.map(([label, val]) =>
        `<div class="info-row"><span class="info-label">${label}</span><span class="info-val">${escHtml(String(val))}</span></div>`
    ).join('');
}

function closeInfo() {
    document.getElementById('infoOverlay').classList.remove('open');
}

// file preview
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','tiff','avif']);
const VIDEO_EXTS = new Set(['mp4','webm','mov','m4v','mkv']);
const AUDIO_EXTS = new Set(['mp3','wav','ogg','aac','flac','m4a','opus']);
const TEXT_EXTS  = new Set(['txt','md','json','xml','yaml','yml','toml','ini','env','sh','bash','csv',
                             'py','js','ts','jsx','tsx','css','scss','html','htm','c','cpp','h',
                             'java','go','rs','rb','php','swift','kt','sql','gitignore','dockerfile']);

function openPreview(path, name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const url = '/preview/' + encodeURIComponent(path);

    document.getElementById('previewName').textContent = name;
    document.getElementById('previewDownloadBtn').href = '/download/' + encodeURIComponent(path);

    const body = document.getElementById('previewBody');
    body.innerHTML = '<div class="preview-unsupported"><div class="fv-dl-ring" style="width:24px;height:24px;border-width:3px"></div></div>';
    document.getElementById('previewOverlay').classList.add('open');

    if (IMAGE_EXTS.has(ext)) {
        const img = document.createElement('img');
        img.src = url; img.alt = name;
        img.onload = () => { body.innerHTML = ''; body.appendChild(img); };
        img.onerror = () => showUnsupported(body, name);
    } else if (VIDEO_EXTS.has(ext)) {
        body.innerHTML = `<video controls autoplay><source src="${url}"><p>Can't play this video.</p></video>`;
    } else if (AUDIO_EXTS.has(ext)) {
        body.innerHTML = `<audio controls autoplay src="${url}" style="width:min(420px,100%)"></audio>`;
    } else if (ext === 'pdf') {
        body.innerHTML = `<iframe src="${url}" title="${escHtml(name)}"></iframe>`;
        body.style.padding = '0';
    } else if (TEXT_EXTS.has(ext)) {
        fetch(url).then(r => { if (!r.ok) throw new Error(); return r.text(); })
            .then(text => {
                const div = document.createElement('div');
                div.className = 'preview-code';
                const pre = document.createElement('pre');
                pre.textContent = text;
                div.appendChild(pre);
                body.innerHTML = '';
                body.appendChild(div);
            }).catch(() => showUnsupported(body, name));
    } else {
        showUnsupported(body, name);
    }
}

function showUnsupported(body, name) {
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : 'file';
    body.innerHTML = `
        <div class="preview-unsupported">
            <svg width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
            </svg>
            <p>No preview for .${ext} files</p>
        </div>`;
}

function closePreview() {
    const overlay = document.getElementById('previewOverlay');
    overlay.classList.remove('open');
    // pause alone doesn't stop buffering — clearing src does
    overlay.querySelectorAll('video, audio').forEach(el => { el.pause(); el.src = ''; });
    document.getElementById('previewBody').innerHTML = '';
    document.getElementById('previewBody').style.padding = '';
}

let _toastTimer = null;
function showToast(message, type = 'warn') {
    let toast = document.getElementById('fv-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'fv-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'fv-toast fv-toast-' + type + ' fv-toast-show';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('fv-toast-show'), 3000);
}

function formatTime(seconds) {
    return seconds < 60 ? Math.round(seconds) + 's'
        : seconds < 3600 ? Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's'
        : Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

function humanSize(bytes) {
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(1) + ' ' + units[i];
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
