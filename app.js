/* Shared only by the new PDF and DOCX apps. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const t = AppI18n.t;
  const kind = document.body.dataset.tool, pdf = kind === 'pdf', api = pdf ? PdfMerge : WordMerge;
  const input = document.getElementById('file-input'), list = document.getElementById('file-list');
  const status = document.getElementById('status'), mergeButton = document.getElementById('merge-button');
  const result = document.getElementById('result'), download = document.getElementById('download');
  const clear = document.getElementById('clear-button'), drop = document.getElementById('drop-zone');
  let files = [], busy = false, resultUrl = null;
  const size = bytes => bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
  function announce(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
  function invalidate() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null; result.hidden = true; download.removeAttribute('href');
  }
  function render() {
    list.replaceChildren();
    files.forEach((item, index) => {
      const row = document.createElement('li'); row.className = 'file-row';
      const order = document.createElement('span'); order.className = 'file-order'; order.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('div'); copy.className = 'file-copy';
      const name = document.createElement('strong'); name.className = 'file-name'; name.textContent = item.file.name;
      const bytes = document.createElement('span'); bytes.className = 'file-size'; bytes.textContent = size(item.file.size);
      copy.append(name, bytes); row.append(order, copy);
      if (pdf) {
        const label = document.createElement('label'); label.className = 'range-label'; label.append(t('pages'));
        const range = document.createElement('input'); range.type = 'text'; range.placeholder = t('rangePlaceholder'); range.value = item.range;
        range.setAttribute('aria-label', t('rangeLabel', {name: item.file.name})); range.disabled = busy;
        range.addEventListener('input', () => { item.range = range.value; invalidate(); announce(t('rangeChanged')); });
        label.append(range); copy.append(label);
      }
      const buttons = document.createElement('div'); buttons.className = 'file-buttons';
      for (const [text, label, action, unavailable] of [
        ['↑', t('moveUp'), () => { [files[index - 1], files[index]] = [files[index], files[index - 1]]; }, index === 0],
        ['↓', t('moveDown'), () => { [files[index + 1], files[index]] = [files[index], files[index + 1]]; }, index === files.length - 1],
        ['×', t('remove'), () => files.splice(index, 1), false]
      ]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.textContent = text;
        button.setAttribute('aria-label', `${item.file.name} ${label}`); button.disabled = busy || unavailable;
        button.addEventListener('click', () => { action(); invalidate(); render(); announce(t('listChanged')); }); buttons.append(button);
      }
      row.append(buttons); list.append(row);
    });
    document.getElementById('selection-count').textContent = files.length ? t('fileCount', {count: files.length, size: size(files.reduce((n, item) => n + item.file.size, 0))}) : t('noFiles');
    mergeButton.disabled = busy || files.length < 2; clear.disabled = busy || !files.length; input.disabled = busy;
    document.getElementById('browse-button').disabled = busy;
    document.getElementById('output-name').disabled = busy;
    if (document.getElementById('flatten-forms')) document.getElementById('flatten-forms').disabled = busy;
  }
  function add(incoming) {
    if (busy || !incoming.length) return;
    const candidates = [...files, ...Array.from(incoming).map(file => ({file, range: ''}))];
    try {
      api.validateFiles(candidates.map(item => item.file), 1);
      files = candidates; invalidate(); render(); announce(files.length === 1 ? t('addOne') : t('orderMessage'));
    } catch (error) { announce(AppI18n.error(error.message), true); }
    input.value = '';
  }
  document.getElementById('browse-button').addEventListener('click', () => input.click());
  input.addEventListener('change', () => add(input.files));
  for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => { e.preventDefault(); if (!busy) drop.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', event => add(event.dataTransfer.files));
  document.addEventListener('dragover', event => event.preventDefault()); document.addEventListener('drop', event => event.preventDefault());
  clear.addEventListener('click', () => { files = []; invalidate(); render(); announce(t('cleared')); });
  document.getElementById('flatten-forms')?.addEventListener('change', () => { invalidate(); announce(t('formsChanged')); });
  mergeButton.addEventListener('click', async () => {
    if (busy) return;
    invalidate(); busy = true; render(); announce(t('processing'));
    document.getElementById('tool-panel').setAttribute('aria-busy', 'true');
    try {
      const output = await api.merge(files.map(item => item.file), {ranges: files.map(item => item.range), flattenForms: !!document.getElementById('flatten-forms')?.checked, onProgress: (done, count) => announce(t('progress', {done, count}))});
      const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const blob = new Blob([output.bytes], {type}); resultUrl = URL.createObjectURL(blob); download.href = resultUrl;
      const raw = document.getElementById('output-name').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || t('defaultName');
      download.download = raw.replace(/\.(pdf|docx)$/i, '') + (pdf ? '.pdf' : '.docx');
      document.getElementById('result-details').textContent = t(pdf ? 'pdfDetails' : 'wordDetails', {count: files.length, pages: output.pages, size: size(blob.size)});
      result.hidden = false; announce(t('done')); download.focus();
    } catch (error) { announce(AppI18n.error(error.message), true); }
    finally { busy = false; render(); document.getElementById('tool-panel').setAttribute('aria-busy', 'false'); }
  });
  window.addEventListener('pagehide', invalidate); render();
});
