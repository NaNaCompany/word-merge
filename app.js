/* Shared only by the new PDF and DOCX apps. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
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
        const label = document.createElement('label'); label.className = 'range-label'; label.append('페이지');
        const range = document.createElement('input'); range.type = 'text'; range.placeholder = '전체 또는 1,3-5'; range.value = item.range;
        range.setAttribute('aria-label', `${item.file.name} 페이지 범위`); range.disabled = busy;
        range.addEventListener('input', () => { item.range = range.value; invalidate(); announce('페이지 범위가 변경됐습니다. 다시 합쳐 주세요.'); });
        label.append(range); copy.append(label);
      }
      const buttons = document.createElement('div'); buttons.className = 'file-buttons';
      for (const [text, label, action, unavailable] of [
        ['↑', '위로 이동', () => { [files[index - 1], files[index]] = [files[index], files[index - 1]]; }, index === 0],
        ['↓', '아래로 이동', () => { [files[index + 1], files[index]] = [files[index], files[index + 1]]; }, index === files.length - 1],
        ['×', '삭제', () => files.splice(index, 1), false]
      ]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.textContent = text;
        button.setAttribute('aria-label', `${item.file.name} ${label}`); button.disabled = busy || unavailable;
        button.addEventListener('click', () => { action(); invalidate(); render(); announce('파일 목록을 변경했습니다.'); }); buttons.append(button);
      }
      row.append(buttons); list.append(row);
    });
    document.getElementById('selection-count').textContent = files.length ? `${files.length}개 · ${size(files.reduce((n, item) => n + item.file.size, 0))}` : '선택한 파일이 없습니다';
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
      files = candidates; invalidate(); render(); announce(files.length === 1 ? '파일을 한 개 더 선택하세요.' : '목록 순서대로 합칩니다. 필요한 경우 순서를 바꾸세요.');
    } catch (error) { announce(error.message, true); }
    input.value = '';
  }
  document.getElementById('browse-button').addEventListener('click', () => input.click());
  input.addEventListener('change', () => add(input.files));
  for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => { e.preventDefault(); if (!busy) drop.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('dragging'); });
  drop.addEventListener('drop', event => add(event.dataTransfer.files));
  document.addEventListener('dragover', event => event.preventDefault()); document.addEventListener('drop', event => event.preventDefault());
  clear.addEventListener('click', () => { files = []; invalidate(); render(); announce('선택한 파일을 모두 지웠습니다.'); });
  document.getElementById('flatten-forms')?.addEventListener('change', () => { invalidate(); announce('양식 처리 설정이 변경됐습니다. 다시 합쳐 주세요.'); });
  mergeButton.addEventListener('click', async () => {
    if (busy) return;
    invalidate(); busy = true; render(); announce('문서를 확인하고 있습니다. 잠시 기다려 주세요.');
    document.getElementById('tool-panel').setAttribute('aria-busy', 'true');
    try {
      const output = await api.merge(files.map(item => item.file), {ranges: files.map(item => item.range), flattenForms: !!document.getElementById('flatten-forms')?.checked, onProgress: (done, count) => announce(`${done}/${count}개 문서 처리 중…`)});
      const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const blob = new Blob([output.bytes], {type}); resultUrl = URL.createObjectURL(blob); download.href = resultUrl;
      const raw = document.getElementById('output-name').value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '합친문서';
      download.download = raw.replace(/\.(pdf|docx)$/i, '') + (pdf ? '.pdf' : '.docx');
      document.getElementById('result-details').textContent = `${files.length}개 문서${pdf ? ' · ' + output.pages + '페이지' : ''} · ${size(blob.size)}. 아래 버튼으로 저장하세요.`;
      result.hidden = false; announce('합치기 완료. 결과 파일을 다운로드할 수 있습니다.'); download.focus();
    } catch (error) { announce(error.message || '문서를 처리하지 못했습니다. 원본 파일을 확인해 주세요.', true); }
    finally { busy = false; render(); document.getElementById('tool-panel').setAttribute('aria-busy', 'false'); }
  });
  window.addEventListener('pagehide', invalidate); render();
});
