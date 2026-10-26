const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = JSON.parse(fs.readFileSync('content/locales.json', 'utf8'));
const source = fs.readFileSync('i18n.js', 'utf8');
function locale(language) {
  const box={window:{},document:{getElementById(){return {textContent:JSON.stringify({language,messages:config.messages[language]})};}}};
  vm.runInNewContext(source,box);
  return box.window.AppI18n;
}
test('all locale placeholders, counts, errors and untrusted names render as text',()=>{
  for(const language of Object.keys(config.messages)){
    const api=locale(language);
    assert.equal(api.t('fileCount',{count:2,size:'1 MB'}),config.messages[language].fileCount.replace('{count}','2').replace('{size}','1 MB'));
    assert.equal(api.t('rangeLabel',{name:'<img src=x onerror=alert(1)>.pdf'}).includes('<img src=x onerror=alert(1)>.pdf'),true);
    if(language==='ko')assert.equal(api.error('페이지 범위는 1~2 안에서 입력하세요.'),'페이지 범위는 1~2 안에서 입력하세요.');
    else {
      assert.equal(api.error('페이지 범위는 1~2 안에서 입력하세요.'),api.t('eRangeBounds',{max:2}));
      assert.equal(api.error('PDF 파일을 2~20개 선택하세요.'),api.t('eSelect',{min:2,max:20}));
      assert.equal(api.error('3페이지가 중복됐습니다.'),api.t('eDuplicate',{page:3}));
      assert.equal(api.error('Wi-Fi 이름(SSID)을 입력하세요.'),api.t('eSsid'));
      assert.equal(api.error('로그인 정보가 포함된 주소는 사용할 수 없습니다.'),api.t('eCredentials'));
      assert.equal(api.error('현재 복원 수준에 비해 내용이 너무 깁니다.'),api.t('eCapacity'));
      assert.equal(api.error('변경 내용 추적·메모·삽입 객체가 있는 문서는 먼저 Word에서 정리해 주세요: sample.docx'),api.t('eReview')+'\nsample.docx');
      assert.equal(api.error('전자서명 PDF는 서명을 유지해 결합할 수 없습니다: sample.pdf'),api.t('eSigned')+'\nsample.pdf');
      assert.equal(api.error('an unexpected library exception'),api.t('failed'));
    }
    assert.throws(()=>api.t('missing-key'),/Missing locale key/);
  }
});
test('all known core validation messages have a localized error category',()=>{
  const api=locale('en');
  const core=fs.readFileSync('core.js','utf8');
  const messages=[...core.matchAll(/new Error\((['"`])([^'"`]*[가-힣][^'"`]*)\1/g)].map(m=>m[2].replace(/\$\{[^}]+\}/g,'2').trim());
  assert.ok(messages.length>=10);
  for(const message of messages){
    assert.notEqual(api.error(message),api.t('failed'),message);
    assert.ok(!/[가-힣]/.test(api.error(message)),message);
  }
});
