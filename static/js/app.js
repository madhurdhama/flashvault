const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const progress = document.getElementById('progressContainer');
const bar = document.getElementById('progressBar');
const pctLabel = document.getElementById('progressPercent');
const nameLabel = document.getElementById('progressLabel');
const timeLabel = document.getElementById('progressTime');

let startTime = 0;

// Trigger upload when files are selected
fileInput.onchange = () => fileInput.files.length && uploadFiles();

// Prevent default form submission
form.onsubmit = (e) => e.preventDefault();

async function uploadFiles() {
  const files = [...fileInput.files];
  const total = files.reduce((sum, f) => sum + f.size, 0);

  // Ask server if there is enough free space
  const check = await fetch('/storage-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: total })
  }).then(r => r.json()).catch(() => ({ available: false }));

  if (!check.available) {
    alert('Upload failed - Storage full');
    fileInput.value = '';
    return;
  }

  startTime = Date.now();
  progress.classList.add('show');
  fileInput.disabled = true;

  let uploaded = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const currentPath = form.querySelector('[name="current_path"]').value;

    // Upload each file sequentially
    if (!await uploadSingle(file, currentPath, uploaded, total, i + 1, files.length)) {
      reset();
      return;
    }
    uploaded += file.size;
  }

  // Upload completed
  bar.style.width = pctLabel.textContent = '100%';
  nameLabel.textContent = 'Complete!';
  setTimeout(() => location.reload(), 500);
}

// Upload a single file using streaming
function uploadSingle(file, currentPath, uploaded, total, index, count) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;

      const percent = Math.round((uploaded + e.loaded) / total * 100);
      bar.style.width = pctLabel.textContent = percent + '%';

      // Show file name or progress
      nameLabel.textContent = count === 1
        ? file.name
        : `${index}/${count}: ${file.name}`;

      // Estimate remaining time
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 1) {
        const speed = (uploaded + e.loaded) / elapsed;
        timeLabel.textContent = formatTime((total - uploaded - e.loaded) / speed) + ' left';
      }
    };

    // Upload completed successfully
    xhr.onload = () => {
      if (xhr.status === 200) return resolve(true);
      alert(`Upload failed (${xhr.status})`);
      resolve(false);
    };

    // Network or connection error
    xhr.onerror = () => {
      alert('Upload failed - Network error');
      resolve(false);
    };

    // Start upload
    xhr.open('POST', '/upload');
    xhr.setRequestHeader('X-Filename', file.name);
    xhr.setRequestHeader('X-Upload-Path', currentPath);
    xhr.send(file);
  });
}

// Delete a file from the server
function deleteFileAction(e, path, name) {
  e.stopPropagation();
  if (!confirm(`Delete "${name}"?`)) return;

  fetch(`/delete/${encodeURIComponent(path)}`, { method: 'POST' })
    .then(r => r.json())
    .then(data => { if (!data.success) alert('Delete failed'); })
    .catch(() => alert('Delete failed'))
    .finally(() => location.reload());
}

// Convert seconds to human-readable format
function formatTime(seconds) {
  return seconds < 60
    ? Math.round(seconds) + 's'
    : seconds < 3600
      ? Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's'
      : Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

// Reset upload UI after completion or failure
function reset() {
  progress.classList.remove('show');
  fileInput.disabled = false;
  fileInput.value = '';
  bar.style.width = '0';
  pctLabel.textContent = '0%';
  nameLabel.textContent = '';
  timeLabel.textContent = '';
}