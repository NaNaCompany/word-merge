(function () {
  'use strict';
  const data = JSON.parse(document.getElementById('app-locale').textContent);
  function t(key, values = {}) {
    if (!Object.prototype.hasOwnProperty.call(data.messages, key)) throw new Error('Missing locale key: ' + key);
    return data.messages[key].replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  }
  function error(message) {
    const text = String(message || '');
    if (data.language === 'ko') return text || t('failed');
    let match;
    if ((match = text.match(/^(PDF|DOCX) 파일을 (\d+)~(\d+)개/))) return t('eSelect', {min: match[2], max: match[3]});
    if ((match = text.match(/^페이지 범위는 1~(\d+)/))) return t('eRangeBounds', {max: match[1]});
    if ((match = text.match(/^(\d+)페이지가 중복/))) return t('eDuplicate', {page: match[1]});
    const rules = [
      [/^페이지가 없는|^PDF 형식|^손상됐거나 읽을 수 없는 PDF/, 'ePdfInvalid'],
      [/^페이지 범위는/, 'eRange'], [/^한 번에/, 'ePageLimit'],
      [/^확장자가/, 'ePdfOnly'], [/^빈 파일/, 'eEmpty'],
      [/^선택한 파일의 합계/, 'ePdfSize'], [/처리기를 불러오지/, 'eEngine'],
      [/^암호가 설정된 PDF/, 'eEncrypted'], [/^전자서명/, 'eSigned'],
      [/^입력 양식이/, 'eForms'], [/^입력 양식의/, 'eFormFailed'],
      [/^Word에서 .docx/, 'eDocxOnly'], [/^파일당 25MB/, 'eDocxSize'],
      [/^선택한 문서의 합계/, 'eDocxTotal'], [/150MB/, 'eExpanded'],
      [/^변경 내용 추적/, 'eReview'], [/^편집 제한/, 'eLocked'],
      [/^매크로|^외부 파일|^이미지 또는 외부 링크|^외부 엔티티|^문서 외부|^안전하지 않은/, 'eDocxUnsupported'],
      [/DOCX|XML|압축|Word 문서 형식|문서 본문|문서 구성요소/, 'eDocxInvalid'],
      [/^Wi-Fi 이름\(SSID\)/, 'eSsid'], [/^Wi-Fi 이름은/, 'eSsidLength'],
      [/^Wi-Fi 보안/, 'eAuth'], [/^Wi-Fi 비밀번호/, 'ePassword'],
      [/^웹사이트 주소|^https:\/\/|^http:\/\//, 'eUrl'],
      [/^QR 코드에 담을/, 'eText'], [/^로그인 정보/, 'eCredentials'],
      [/^지원하지 않는 QR/, 'eQrType'], [/^내용이 너무/, 'eTextLength'],
      [/^오류 복원/, 'eEcc'], [/^현재 복원/, 'eCapacity']
    ];
    const rule = rules.find(([pattern]) => pattern.test(text));
    const translated = t(rule ? rule[1] : 'failed');
    // These core errors append a local file/part name. Render as text only.
    const split = text.indexOf(': ');
    return translated + (rule && split !== -1 ? '\n' + text.slice(split + 2) : '');
  }
  window.AppI18n = Object.freeze({language: data.language, t, error});
})();
