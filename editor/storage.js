// Zero-server storage helpers:
// 1. File System Access API (Chrome/Edge direct local overwrite — zero download clutter)
// 2. GitHub REST API direct commit (zero Mac SSD footprint)
// 3. Blob download fallback (Safari/Firefox)

let currentFileHandle = null;

export function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export function hasOpenFileHandle() {
  return Boolean(currentFileHandle);
}

export async function openStageJsonFile() {
  if (typeof window.showOpenFilePicker === 'function') {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Diorama Stage JSON', accept: { 'application/json': ['.json'] } }],
    });
    currentFileHandle = handle;
    const file = await handle.getFile();
    return { name: file.name, data: JSON.parse(await file.text()) };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Cancelled'));
      try {
        resolve({ name: file.name, data: JSON.parse(await file.text()) });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export async function saveStageJson(stage, saveAs = false) {
  const jsonText = JSON.stringify(stage, null, 2) + '\n';
  const suggestedName = `${stage.meta?.id || 'stage'}.diorama.json`;

  if (supportsFileSystemAccess()) {
    if (saveAs || !currentFileHandle) {
      currentFileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Diorama Stage JSON', accept: { 'application/json': ['.json'] } }],
      });
    }
    const writable = await currentFileHandle.createWritable();
    await writable.write(jsonText);
    await writable.close();
    return { mode: 'fs-access', name: currentFileHandle.name };
  }

  downloadBlob(new Blob([jsonText], { type: 'application/json' }), suggestedName);
  return { mode: 'download', name: suggestedName };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Directly commits a stage JSON to any GitHub repository using a user-provided Fine-grained PAT.
 * Token is kept in sessionStorage only if opted in (never sent anywhere except api.github.com).
 */
export async function commitStageToGitHub({ owner, repo, branch = 'main', path, token, stage, message }) {
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let existingSha = undefined;
  const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const meta = await getRes.json();
    existingSha = meta.sha;
  }

  const content = toBase64Utf8(JSON.stringify(stage, null, 2) + '\n');
  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `Update diorama stage ${stage.meta?.id || 'stage'}`,
      content,
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API ${putRes.status}: ${errText.slice(0, 200)}`);
  }
  return await putRes.json();
}
