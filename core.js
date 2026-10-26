/* NaNa Lab DOCX merger. Original Open XML parts are copied, never converted to plain text. */
(function (root) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const LIMITS = Object.freeze({files: 10, fileBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, expandedBytes: 150 * 1024 * 1024, entries: 3000});
  const children = node => Array.from(node.childNodes || []).filter(n => n.nodeType === 1);
  const all = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
  const value = (node, name = 'val') => node.getAttributeNS(W, name);
  const set = (node, name, val) => node.setAttributeNS(W, 'w:' + name, String(val));
  const xml = node => new root.XMLSerializer().serializeToString(node);
  function parse(text, label) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('외부 엔티티가 포함된 XML은 지원하지 않습니다: ' + label);
    let doc;
    try { doc = new root.DOMParser().parseFromString(text, 'application/xml'); } catch (_) { throw new Error('XML을 읽을 수 없습니다: ' + label); }
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) throw new Error('손상된 XML입니다: ' + label);
    return doc;
  }
  function normalize(path) {
    const stack = [];
    for (const part of path.replace(/\\/g, '/').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!stack.length) throw new Error('문서 외부 경로는 지원하지 않습니다.'); stack.pop(); }
      else stack.push(part);
    }
    return stack.join('/');
  }
  const directory = part => part.includes('/') ? part.slice(0, part.lastIndexOf('/') + 1) : '';
  function relative(from, to) {
    const a = directory(from).split('/').filter(Boolean), b = to.split('/');
    while (a.length && a[0] === b[0]) { a.shift(); b.shift(); }
    return '../'.repeat(a.length) + b.join('/');
  }
  function zipPreflight(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
    if (end < 0) throw new Error('DOCX 압축 구조를 읽을 수 없습니다.');
    const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count > LIMITS.entries || offset >= end) throw new Error('지원 범위를 넘는 DOCX 압축 구조입니다.');
    let at = offset, total = 0;
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new Error('손상된 DOCX 압축 목록입니다.');
      const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
      const size = view.getUint32(at + 24, true), length = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
      if (flags & 1 || ![0, 8].includes(method)) throw new Error('암호화되거나 지원하지 않는 압축 방식입니다.');
      if (at + 46 + length + extra + comment > end) throw new Error('손상된 압축 항목입니다.');
      const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + length));
      if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('안전하지 않은 압축 경로입니다.');
      total += size;
      if (size > LIMITS.expandedBytes || total > LIMITS.expandedBytes) throw new Error('압축 해제 후 문서가 150MB를 넘습니다.');
      at += 46 + length + extra + comment;
    }
    return total;
  }
  function validateFiles(files, minimum = 2) {
    if (files.length < minimum || files.length > LIMITS.files) throw new Error(`DOCX 파일을 ${minimum}~10개 선택하세요.`);
    let total = 0;
    for (const file of files) {
      if (!/\.docx$/i.test(file.name || '')) throw new Error('Word에서 .docx로 저장한 파일만 사용할 수 있습니다. .doc·HWP·PDF는 지원하지 않습니다.');
      if (!file.size || file.size > LIMITS.fileBytes) throw new Error('파일당 25MB 이하의 DOCX를 선택하세요: ' + file.name);
      total += file.size;
    }
    if (total > LIMITS.totalBytes) throw new Error('선택한 문서의 합계가 100MB를 넘습니다.');
  }
  async function read(bytes, label, Zip) {
    const expanded = zipPreflight(bytes);
    let zip;
    try { zip = await Zip.loadAsync(bytes); } catch (_) { throw new Error('암호가 설정됐거나 손상된 DOCX입니다: ' + label); }
    for (const part of ['[Content_Types].xml', 'word/document.xml', '_rels/.rels']) if (!zip.file(part)) throw new Error('Word DOCX 문서가 아닙니다: ' + label);
    const types = parse(await zip.file('[Content_Types].xml').async('string'), label);
    if (/macroEnabled|vbaProject/i.test(xml(types))) throw new Error('매크로 문서는 지원하지 않습니다: ' + label);
    const document = parse(await zip.file('word/document.xml').async('string'), label);
    if (document.documentElement.namespaceURI !== W) throw new Error('지원하는 Word 문서 형식이 아닙니다. Word에서 일반 DOCX로 다시 저장하세요: ' + label);
    // Complex reviewed or embedded content must not silently disappear in a merge.
    for (const tag of ['altChunk', 'ins', 'del', 'moveFrom', 'moveTo', 'commentRangeStart', 'commentReference', 'object']) if (all(document, tag).length) throw new Error('변경 내용 추적·메모·삽입 객체가 있는 문서는 먼저 Word에서 정리해 주세요: ' + label);
    if (zip.file('word/settings.xml') && /documentProtection/.test(await zip.file('word/settings.xml').async('string'))) throw new Error('편집 제한이 있는 문서는 먼저 Word에서 제한을 해제해 주세요: ' + label);
    if (Object.keys(zip.files).some(p => /^_xmlsignatures\//i.test(p))) throw new Error('전자서명 문서는 결합할 수 없습니다: ' + label);
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.endsWith('.rels')) continue;
      const rels = parse(await entry.async('string'), path);
      for (const rel of children(rels.documentElement)) {
        if (rel.getAttribute('TargetMode') === 'External') {
          if (!rel.getAttribute('Type').endsWith('/hyperlink')) throw new Error('외부 파일을 참조하는 문서는 지원하지 않습니다: ' + label);
        } else {
          const owner = path === '_rels/.rels' ? '' : path.replace('/_rels/', '/').replace(/\.rels$/, '');
          const target = rel.getAttribute('Target');
          const resolved = normalize(target.startsWith('/') ? target : directory(owner) + target);
          if (!zip.file(resolved)) throw new Error('연결된 문서 구성요소가 없습니다: ' + label);
        }
      }
    }
    return {zip, types, document, expanded};
  }
  const partDoc = (name, element) => parse(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${element} xmlns:w="${W}" xmlns:r="${R}"/>`, name);
  async function merge(files, options = {}) {
    validateFiles(files);
    const Zip = root.JSZip || (typeof require === 'function' && require('./vendor/jszip.min.js'));
    const first = await read(new Uint8Array(await files[0].arrayBuffer()), files[0].name, Zip);
    const out = first.zip, document = first.document, body = all(document, 'body')[0], types = first.types;
    if (!body) throw new Error('문서 본문이 없습니다.');
    const relPath = 'word/_rels/document.xml.rels';
    const rels = out.file(relPath) ? parse(await out.file(relPath).async('string'), relPath) : parse(`<Relationships xmlns="${REL}"/>`, relPath);
    let relIndex = 1, drawIndex = 1, bookmarkIndex = 1;
    const newRel = (type, target, mode) => {
      let id; do { id = 'nana' + relIndex++; } while (children(rels.documentElement).some(n => n.getAttribute('Id') === id));
      const node = rels.createElementNS(REL, 'Relationship'); node.setAttribute('Id', id); node.setAttribute('Type', type); node.setAttribute('Target', target); if (mode) node.setAttribute('TargetMode', mode);
      rels.documentElement.appendChild(node); return id;
    };
    const addType = (part, contentType) => {
      const name = '/' + part;
      if (children(types.documentElement).some(n => n.localName === 'Override' && n.getAttribute('PartName') === name)) return;
      const node = types.createElementNS(CT, 'Override'); node.setAttribute('PartName', name); node.setAttribute('ContentType', contentType); types.documentElement.appendChild(node);
    };
    const ensureRel = (kind, target) => { if (!children(rels.documentElement).some(n => n.getAttribute('Type') === R + '/' + kind)) newRel(R + '/' + kind, target); };
    const styles = out.file('word/styles.xml') ? parse(await out.file('word/styles.xml').async('string'), 'styles') : partDoc('styles', 'styles');
    const numbering = out.file('word/numbering.xml') ? parse(await out.file('word/numbering.xml').async('string'), 'numbering') : partDoc('numbering', 'numbering');
    let abstractIndex = 1 + Math.max(0, ...all(numbering, 'abstractNum').map(n => Number(value(n, 'abstractNumId'))));
    let numberIndex = 1 + Math.max(0, ...all(numbering, 'num').map(n => Number(value(n, 'numId'))));
    const notes = {};
    for (const kind of ['footnotes', 'endnotes']) notes[kind] = out.file('word/' + kind + '.xml') ? parse(await out.file('word/' + kind + '.xml').async('string'), kind) : partDoc(kind, kind);
    for (const node of Array.from(document.getElementsByTagName('*'))) {
      if (node.localName === 'docPr') drawIndex = Math.max(drawIndex, Number(node.getAttribute('id')) + 1);
      if (node.namespaceURI === W && node.localName === 'bookmarkStart') bookmarkIndex = Math.max(bookmarkIndex, Number(value(node, 'id')) + 1);
    }
    let expandedTotal = first.expanded;
    for (let i = 1; i < files.length; i++) {
      const source = await read(new Uint8Array(await files[i].arrayBuffer()), files[i].name, Zip), prefix = `imports/doc${i + 1}/`;
      expandedTotal += source.expanded;
      if (expandedTotal > LIMITS.expandedBytes) throw new Error('전체 문서의 압축 해제 크기가 150MB를 넘습니다.');
      const srcBody = all(source.document, 'body')[0];
      if (!srcBody) throw new Error('문서 본문이 없습니다: ' + files[i].name);
      const styleMap = new Map(), numberMap = new Map(), abstractMap = new Map(), bookmarkMap = new Map(), bookmarkNames = new Map();
      const srcStyles = source.zip.file('word/styles.xml') ? parse(await source.zip.file('word/styles.xml').async('string'), 'styles') : partDoc('styles', 'styles');
      for (const style of all(srcStyles, 'style')) styleMap.set(value(style, 'styleId'), `doc${i + 1}_${value(style, 'styleId')}`);
      const defaultStyle = all(srcStyles, 'style').find(n => value(n, 'type') === 'paragraph' && value(n, 'default') === '1');
      const defaultStyleId = defaultStyle ? value(defaultStyle, 'styleId') : (styleMap.has('Normal') ? 'Normal' : null);
      const srcNumbers = source.zip.file('word/numbering.xml') ? parse(await source.zip.file('word/numbering.xml').async('string'), 'numbering') : partDoc('numbering', 'numbering');
      for (const n of all(srcNumbers, 'abstractNum')) abstractMap.set(value(n, 'abstractNumId'), String(abstractIndex++));
      for (const n of all(srcNumbers, 'num')) numberMap.set(value(n, 'numId'), String(numberIndex++));
      const noteMaps = {};
      for (const kind of ['footnotes', 'endnotes']) {
        const singular = kind.slice(0, -1), map = noteMaps[kind] = new Map();
        let next = 1 + Math.max(0, ...all(notes[kind], singular).map(n => Number(value(n, 'id'))));
        if (source.zip.file('word/' + kind + '.xml')) {
          const src = parse(await source.zip.file('word/' + kind + '.xml').async('string'), kind);
          for (const n of all(src, singular)) if (Number(value(n, 'id')) > 0) map.set(value(n, 'id'), String(next++));
        }
      }
      for (const n of all(source.document, 'bookmarkStart')) {
        bookmarkMap.set(value(n, 'id'), String(bookmarkIndex++));
        bookmarkNames.set(value(n, 'name'), `doc${i + 1}_${value(n, 'name')}`);
      }
      function rewrite(doc, documentRelations) {
        for (const n of Array.from(doc.getElementsByTagName('*'))) {
          if (n.namespaceURI === W) {
            const name = n.localName, v = value(n);
            if (['pStyle', 'rStyle', 'tblStyle', 'basedOn', 'next', 'link', 'styleLink', 'numStyleLink'].includes(name) && styleMap.has(v)) set(n, 'val', styleMap.get(v));
            if (name === 'style') {
              set(n, 'styleId', styleMap.get(value(n, 'styleId'))); n.removeAttributeNS(W, 'default'); set(n, 'customStyle', '1');
              // Word processors may unify equal display names despite distinct styleId values.
              const displayName = children(n).find(child => child.namespaceURI === W && child.localName === 'name');
              if (displayName) set(displayName, 'val', `Document ${i + 1} - ${value(displayName)}`);
              for (const alias of children(n).filter(child => child.localName === 'aliases')) n.removeChild(alias);
            }
            if (name === 'numId' && numberMap.has(v)) set(n, 'val', numberMap.get(v));
            if (name === 'num' && numberMap.has(value(n, 'numId'))) set(n, 'numId', numberMap.get(value(n, 'numId')));
            if (name === 'abstractNum' && abstractMap.has(value(n, 'abstractNumId'))) set(n, 'abstractNumId', abstractMap.get(value(n, 'abstractNumId')));
            if (name === 'abstractNumId' && abstractMap.has(v)) set(n, 'val', abstractMap.get(v));
            for (const kind of ['footnotes', 'endnotes']) {
              const singular = kind.slice(0, -1), id = value(n, 'id');
              if ([singular, singular + 'Reference'].includes(name) && noteMaps[kind].has(id)) set(n, 'id', noteMaps[kind].get(id));
            }
            if (['bookmarkStart', 'bookmarkEnd'].includes(name) && bookmarkMap.has(value(n, 'id'))) set(n, 'id', bookmarkMap.get(value(n, 'id')));
            if (name === 'bookmarkStart' && bookmarkNames.has(value(n, 'name'))) set(n, 'name', bookmarkNames.get(value(n, 'name')));
            if (name === 'hyperlink' && bookmarkNames.has(value(n, 'anchor'))) set(n, 'anchor', bookmarkNames.get(value(n, 'anchor')));
          }
          if (n.localName === 'docPr' || n.localName === 'cNvPr') n.setAttribute('id', String(drawIndex++));
          if (documentRelations) for (const attr of Array.from(n.attributes || [])) if (attr.namespaceURI === R && documentRelations.has(attr.value)) n.setAttributeNS(R, attr.name, documentRelations.get(attr.value));
        }
        return doc;
      }
      const srcRels = source.zip.file(relPath) ? parse(await source.zip.file(relPath).async('string'), relPath) : parse(`<Relationships xmlns="${REL}"/>`, relPath);
      const relMap = new Map();
      const special = new Set(['styles', 'stylesWithEffects', 'numbering', 'footnotes', 'endnotes', 'settings', 'theme', 'fontTable', 'webSettings']);
      for (const rel of children(srcRels.documentElement)) {
        const type = rel.getAttribute('Type'), kind = type.split('/').pop();
        if (special.has(kind)) continue;
        const mode = rel.getAttribute('TargetMode'), target = rel.getAttribute('Target');
        const mapped = mode === 'External' ? target : relative('word/document.xml', prefix + normalize(target.startsWith('/') ? target : 'word/' + target));
        relMap.set(rel.getAttribute('Id'), newRel(type, mapped, mode));
      }
      // Carry namespace declarations required by imported drawings and extension elements.
      for (const attr of Array.from(source.document.documentElement.attributes)) if (attr.name.startsWith('xmlns:') && !document.documentElement.hasAttribute(attr.name)) document.documentElement.setAttribute(attr.name, attr.value);
      rewrite(source.document, relMap);
      for (const paragraph of all(source.document, 'p')) if (defaultStyleId && !children(paragraph).find(n => n.localName === 'pPr')?.getElementsByTagNameNS(W, 'pStyle').length) {
        let pr = children(paragraph).find(n => n.localName === 'pPr');
        if (!pr) { pr = source.document.createElementNS(W, 'w:pPr'); paragraph.insertBefore(pr, paragraph.firstChild); }
        const st = source.document.createElementNS(W, 'w:pStyle'); set(st, 'val', styleMap.get(defaultStyleId)); pr.insertBefore(st, pr.firstChild);
      }
      const defaultRun = all(srcStyles, 'rPrDefault')[0], defaultParagraph = all(srcStyles, 'pPrDefault')[0];
      rewrite(srcStyles);
      for (const style of all(srcStyles, 'style')) {
        for (const [name, defaults] of [['rPr', defaultRun], ['pPr', defaultParagraph]]) {
          const values = defaults && children(defaults).find(n => n.localName === name);
          if (!values) continue;
          let target = children(style).find(n => n.localName === name);
          if (!target) { target = srcStyles.createElementNS(W, 'w:' + name); style.appendChild(target); }
          for (const child of children(values)) if (!children(target).some(n => n.localName === child.localName)) target.appendChild(child.cloneNode(true));
        }
        styles.documentElement.appendChild(styles.importNode(style, true));
      }
      rewrite(srcNumbers);
      for (const n of children(srcNumbers.documentElement)) {
        const before = children(numbering.documentElement).find(existing => n.localName === 'abstractNum' ? ['num', 'numIdMacAtCleanup'].includes(existing.localName) : existing.localName === 'numIdMacAtCleanup');
        numbering.documentElement.insertBefore(numbering.importNode(n, true), before || null);
      }
      const defaults = new Map(children(source.types.documentElement).filter(n => n.localName === 'Default').map(n => [n.getAttribute('Extension'), n.getAttribute('ContentType')]));
      const overrides = new Map(children(source.types.documentElement).filter(n => n.localName === 'Override').map(n => [n.getAttribute('PartName').replace(/^\//, ''), n.getAttribute('ContentType')]));
      for (const [path, entry] of Object.entries(source.zip.files)) {
        if (entry.dir || path === '[Content_Types].xml' || path === '_rels/.rels' || path.startsWith('docProps/')) continue;
        if (['word/document.xml', relPath, 'word/styles.xml', 'word/numbering.xml', 'word/footnotes.xml', 'word/endnotes.xml', 'word/stylesWithEffects.xml'].includes(path)) continue;
        const destination = prefix + path;
        if (path.endsWith('.rels')) {
          const part = parse(await entry.async('string'), path);
          for (const rel of children(part.documentElement)) if (rel.getAttribute('TargetMode') !== 'External' && rel.getAttribute('Target').startsWith('/')) rel.setAttribute('Target', '/' + prefix + normalize(rel.getAttribute('Target')));
          out.file(destination, xml(part));
        } else if (path.startsWith('word/') && path.endsWith('.xml')) out.file(destination, xml(rewrite(parse(await entry.async('string'), path))));
        else out.file(destination, await entry.async('uint8array'));
        const contentType = overrides.get(path) || defaults.get(path.split('.').pop());
        if (contentType && !path.endsWith('.rels')) addType(destination, contentType);
      }
      for (const kind of ['footnotes', 'endnotes']) if (source.zip.file('word/' + kind + '.xml')) {
        const src = rewrite(parse(await source.zip.file('word/' + kind + '.xml').async('string'), kind));
        for (const n of children(src.documentElement)) if (Number(value(n, 'id')) > 0 || !all(notes[kind], kind.slice(0, -1)).some(existing => value(existing, 'id') === value(n, 'id'))) {
          // Note images/hyperlinks have their own relationships: copy and remap to the destination note file.
          const noteRelPath = 'word/_rels/' + kind + '.xml.rels';
          if (source.zip.file(noteRelPath)) throw new Error('이미지 또는 외부 링크가 있는 각주·미주는 현재 지원하지 않습니다: ' + files[i].name);
          notes[kind].documentElement.appendChild(notes[kind].importNode(n, true));
        }
      }
      const previous = children(body).findLast(n => n.namespaceURI === W && n.localName === 'sectPr');
      if (previous) {
        body.removeChild(previous);
        let type = children(previous).find(n => n.localName === 'type');
        if (!type) {
          type = document.createElementNS(W, 'w:type');
          const before = children(previous).find(n => !['headerReference', 'footerReference', 'footnotePr', 'endnotePr'].includes(n.localName));
          previous.insertBefore(type, before || null);
        }
        set(type, 'val', 'nextPage');
        const paragraph = document.createElementNS(W, 'w:p'), pr = document.createElementNS(W, 'w:pPr'); pr.appendChild(previous); paragraph.appendChild(pr); body.appendChild(paragraph);
      }
      // An empty source header/footer must not inherit the previous document's header/footer.
      for (const sect of all(source.document, 'sectPr')) for (const kind of ['header', 'footer']) for (const mode of ['default', 'first', 'even']) if (!children(sect).some(n => n.localName === kind + 'Reference' && value(n, 'type') === mode)) {
        const part = prefix + 'word/empty-' + kind + '.xml';
        if (!out.file(part)) { out.file(part, xml(partDoc(kind, kind === 'header' ? 'hdr' : 'ftr'))); addType(part, `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`); }
        const node = source.document.createElementNS(W, 'w:' + kind + 'Reference'); set(node, 'type', mode); node.setAttributeNS(R, 'r:id', newRel(R + '/' + kind, relative('word/document.xml', part)));
        const before = children(sect).find(n => kind === 'header' ? n.localName !== 'headerReference' : !['headerReference', 'footerReference'].includes(n.localName));
        sect.insertBefore(node, before || null);
      }
      for (const node of children(srcBody)) body.appendChild(document.importNode(node, true));
      options.onProgress?.(i + 1, files.length);
    }
    out.file('word/document.xml', xml(document)); out.file(relPath, xml(rels));
    if (all(styles, 'style').length) { out.file('word/styles.xml', xml(styles)); ensureRel('styles', 'styles.xml'); addType('word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'); }
    if (all(numbering, 'num').length) { out.file('word/numbering.xml', xml(numbering)); ensureRel('numbering', 'numbering.xml'); addType('word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'); }
    for (const kind of ['footnotes', 'endnotes']) if (all(notes[kind], kind.slice(0, -1)).length) { out.file('word/' + kind + '.xml', xml(notes[kind])); ensureRel(kind, kind + '.xml'); addType('word/' + kind + '.xml', `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`); }
    out.file('[Content_Types].xml', xml(types));
    return {bytes: await out.generateAsync({type: 'uint8array', compression: 'DEFLATE', compressionOptions: {level: 6}}), documents: files.length};
  }
  const api = {LIMITS, zipPreflight, validateFiles, merge};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WordMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
