const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const progress = document.getElementById('progressContainer');
const bar = document.getElementById('progressBar');
const pctLabel = document.getElementById('progressPercent');
const nameLabel = document.getElementById('progressLabel');
const timeLabel = document.getElementById('progressTime');

let startTime = 0;

fileInput.onchange = () => fileInput.files.length && uploadFiles();
form.onsubmit = (e) => e.preventDefault();

async function uploadFiles() {
  const files = [...fileInput.files];
  const total = files.reduce((sum, f) => sum + f.size, 0);

  // Pre-check storage availability (optional but improves UX)
  const check = await fetch('/storage-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: total })
  }).then(r => r.json()).catch(() => ({ available: false }));

  if (!check.available) {
    alert('Storage quota exceeded');
    fileInput.value = '';
    return;
  }

  startTime = Date.now();
  progress.classList.add('show');
  fileInput.disabled = true;

  let uploaded = 0;

  // Upload files sequentially
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const currentPath = form.querySelector('[name="current_path"]').value;

    if (!await uploadSingle(file, currentPath, uploaded, total, i + 1, files.length)) {
      reset();
      return;
    }
    uploaded += file.size;
  }

  // All uploads complete
  bar.style.width = pctLabel.textContent = '100%';
  nameLabel.textContent = 'Complete!';
  setTimeout(() => location.reload(), 500);
}

function uploadSingle(file, currentPath, uploaded, total, index, count) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();

    // Update progress bar
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;

      const percent = Math.round((uploaded + e.loaded) / total * 100);
      bar.style.width = pctLabel.textContent = percent + '%';

      nameLabel.textContent = count === 1
        ? file.name
        : `${index}/${count}: ${file.name}`;

      // Show estimated time remaining
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 1) {
        const speed = (uploaded + e.loaded) / elapsed;
        timeLabel.textContent = formatTime((total - uploaded - e.loaded) / speed) + ' left';
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        return resolve(true);
      }

      // Show server error message
      try {
        const response = JSON.parse(xhr.responseText);
        alert(response.error || 'Upload failed');
      } catch (e) {
        alert('Upload failed');
      }
      resolve(false);
    };

    xhr.onerror = () => {
      alert('Network error');
      resolve(false);
    };

    // Send file to server
    xhr.open('POST', '/upload');
    xhr.setRequestHeader('X-Filename', file.name);
    xhr.setRequestHeader('X-Upload-Path', currentPath);
    xhr.send(file);
  });
}

function deleteFileAction(e, path, name) {
  e.stopPropagation();
  if (!confirm(`Delete "${name}"?`)) return;

  fetch(`/delete/${encodeURIComponent(path)}`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        alert(data.error || 'Delete failed');
      }
    })
    .catch(() => alert('Delete failed'))
    .finally(() => location.reload());
}

function formatTime(seconds) {
  return seconds < 60
    ? Math.round(seconds) + 's'
    : seconds < 3600
      ? Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's'
      : Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

function reset() {
  progress.classList.remove('show');
  fileInput.disabled = false;
  fileInput.value = '';
  bar.style.width = '0';
  pctLabel.textContent = '0%';
  nameLabel.textContent = '';
  timeLabel.textContent = '';
}