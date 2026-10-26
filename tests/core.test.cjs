const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const posix=path.posix; const crypto=require('node:crypto');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
global.DOMParser=DOMParser;global.XMLSerializer=XMLSerializer;
const Zip=require('../vendor/jszip.min.js');const core=require('../core.js');
fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes});
const fixture=name=>file(name,fs.readFileSync(path.join(__dirname,'fixtures',name)));
const parse=text=>new DOMParser().parseFromString(text,'application/xml');
const elements=(doc,ns,name)=>Array.from(doc.getElementsByTagNameNS(ns,name));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function validatePackage(zip){
  for(const [name,entry]of Object.entries(zip.files)){
    if(entry.dir||!name.endsWith('.rels'))continue;const doc=parse(await entry.async('string'));
    for(const rel of elements(doc,'http://schemas.openxmlformats.org/package/2006/relationships','Relationship')){
      if(rel.getAttribute('TargetMode')==='External')continue;
      const owner=name==='_rels/.rels'?'':name.replace('/_rels/','/').replace(/\.rels$/,'');const target=rel.getAttribute('Target');
      const resolved=posix.normalize(target.startsWith('/')?target.slice(1):posix.join(posix.dirname(owner),target));assert.ok(zip.file(resolved),'Missing target '+resolved+' from '+name);
    }
  }
}
test('merge rich DOCX with tables, images, styles, notes and sections',async()=>{
  const output=await core.merge([fixture('alpha.docx'),fixture('beta.docx')]);const zip=await Zip.loadAsync(output.bytes);await validatePackage(zip);
  const document=parse(await zip.file('word/document.xml').async('string'));const text=elements(document,W,'t').map(n=>n.textContent).join('|');
  assert.ok(text.indexOf('ALPHA DOCUMENT')<text.indexOf('BETA DOCUMENT'));assert.equal(elements(document,W,'tbl').length,2);assert.equal(elements(document,W,'sectPr').length,2);
  const styles=parse(await zip.file('word/styles.xml').async('string'));const ids=elements(styles,W,'style').map(n=>n.getAttributeNS(W,'styleId'));assert.equal(ids.length,new Set(ids).size);assert.ok(ids.includes('doc2_SharedStyle'));
  const displayNames=elements(styles,W,'style').map(n=>elements(n,W,'name')[0]?.getAttributeNS(W,'val')).filter(Boolean);assert.equal(displayNames.length,new Set(displayNames).size,'Style display names must not collide in office renderers');
  for(const reference of ['pStyle','rStyle','tblStyle'])for(const n of elements(document,W,reference))assert.ok(ids.includes(n.getAttributeNS(W,'val')),'Undefined style');
  const notes=parse(await zip.file('word/footnotes.xml').async('string'));const noteIds=elements(notes,W,'footnote').map(n=>n.getAttributeNS(W,'id'));assert.equal(noteIds.length,new Set(noteIds).size);
  assert.deepEqual(elements(document,W,'footnoteReference').map(n=>n.getAttributeNS(W,'id')),['1','2']);
  const bookmarks=elements(document,W,'bookmarkStart').map(n=>n.getAttributeNS(W,'id'));assert.equal(bookmarks.length,new Set(bookmarks).size);
  const imageHashes=[];for(const [name,entry]of Object.entries(zip.files))if(/\/media\/.*\.png$/.test(name))imageHashes.push(hash(await entry.async('uint8array')));
  assert.equal(new Set(imageHashes).size,2,'Both distinct source images survive');
  const rank={headerReference:0,footerReference:1,footnotePr:2,endnotePr:3,type:4,pgSz:5,pgMar:6,paperSrc:7,pgBorders:8,lnNumType:9,pgNumType:10,cols:11,formProt:12,vAlign:13,noEndnote:14,titlePg:15,textDirection:16,bidi:17,rtlGutter:18,docGrid:19,printerSettings:20,sectPrChange:21};
  for(const sect of elements(document,W,'sectPr')){let last=-1;for(const n of Array.from(sect.childNodes).filter(n=>n.nodeType===1)){const current=rank[n.localName];if(current!==undefined){assert.ok(current>=last,'Section order: '+n.localName);last=current;}}}
  const nums=parse(await zip.file('word/numbering.xml').async('string'));let seenNum=false;for(const n of Array.from(nums.documentElement.childNodes).filter(n=>n.nodeType===1)){if(n.localName==='num')seenNum=true;if(n.localName==='abstractNum')assert.equal(seenNum,false,'Abstract numbers precede number instances');}
  fs.writeFileSync(path.join(__dirname,'output','combined.docx'),output.bytes);
});
test('empty second header is explicitly cleared rather than inherited',async()=>{
  const result=await core.merge([fixture('alpha.docx'),fixture('no-header.docx')]);const zip=await Zip.loadAsync(result.bytes);await validatePackage(zip);
  const doc=parse(await zip.file('word/document.xml').async('string'));const sect=elements(doc,W,'sectPr').at(-1);assert.equal(elements(sect,W,'headerReference').length,3);assert.equal(elements(sect,W,'footerReference').length,3);
  fs.writeFileSync(path.join(__dirname,'output','no-header.docx'),result.bytes);
});
test('file count, format, malformed ZIP and zip expansion guard',async()=>{
  assert.throws(()=>core.validateFiles([fixture('alpha.docx')]));assert.throws(()=>core.validateFiles([file('old.doc',Buffer.from('bad')),fixture('alpha.docx')]));
  await assert.rejects(core.merge([file('bad.docx',Buffer.from('not a zip')),fixture('beta.docx')]));
  const bad=Buffer.from(await fixture('alpha.docx').arrayBuffer());let at=bad.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bad.writeUInt32LE(0x7fffffff,at+24);assert.throws(()=>core.zipPreflight(bad));
});
test('reject tracked changes rather than silently dropping reviewed text',async()=>{
  const zip=await Zip.loadAsync(await fixture('alpha.docx').arrayBuffer());let source=await zip.file('word/document.xml').async('string');source=source.replace(/<[^>]*:body>/,m=>m+`<w:ins xmlns:w="${W}"><w:r><w:t>UNACCEPTED CHANGE</w:t></w:r></w:ins>`);zip.file('word/document.xml',source);
  const bytes=await zip.generateAsync({type:'uint8array'});await assert.rejects(core.merge([fixture('beta.docx'),file('review.docx',bytes)]),/変更|변경/);
});
