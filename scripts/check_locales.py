"""Validate crawlable locale pages and shared assets without third-party packages."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json,re,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
LANGS=['ko','en','ja','zh','es','de','fr','pt','ru']
class Page(HTMLParser):
    def __init__(self,text):
        super().__init__();self.ids=[];self.links=[];self.scripts=[];self.assets=[];self.lang='';self.h1=0;self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='html':self.lang=a['lang']
        if tag=='h1':self.h1+=1
        if a.get('id'):self.ids.append(a['id'])
        if tag=='link':self.links.append(a)
        if tag=='script' and a.get('src'):self.scripts.append(a['src']);self.assets.append(a['src'])
        if tag=='link' and a.get('rel')=='stylesheet':self.assets.append(a['href'])
        if tag=='a' and a.get('href','').startswith('#'):self.links.append({'anchor':a['href'][1:]})

data=json.loads((ROOT/'content/locales.json').read_text(encoding='utf-8'))
base='https://nanalab.kr/'+data['slug']+'/'
expected={lang:base+('' if lang=='ko' else lang+'/') for lang in LANGS}
keys=set(data['messages']['en'])
for lang in LANGS:
    strings=data['messages'][lang];assert set(strings)==keys and all(strings.values())
    for key,text in strings.items():
        assert set(re.findall(r'\{\w+\}',text))==set(re.findall(r'\{\w+\}',data['messages']['en'][key])),(lang,key)
    name=('' if lang=='ko' else lang+'/')+'index.html'
    text=(ROOT/name).read_text(encoding='utf-8');page=Page(text)
    assert page.lang==lang and page.h1==1
    assert len(page.ids)==len(set(page.ids)),name
    assert [a['href'] for a in page.links if a.get('rel')=='canonical']==[expected[lang]]
    alternate={a['hreflang']:a['href'] for a in page.links if a.get('rel')=='alternate'}
    assert alternate=={**expected,'x-default':base},name
    for link in page.links:
        if 'anchor' in link:assert link['anchor'] in page.ids,(name,link)
    for url in page.assets:
        if url.startswith(base):assert (ROOT/urlsplit(url).path.removeprefix('/'+data['slug']+'/')).is_file(),(name,url)
    assert page.scripts.index(next(s for s in page.scripts if '/i18n.js?' in s))<page.scripts.index(next(s for s in page.scripts if '/app.js?' in s))
    assert text.count('class="language-switcher"')==1
    assert all(f'href="{url}" lang="{code}"' in text for code,url in expected.items())
    assert text.count('aria-current="page"')==1
    for marker in ['GTM-NV2WWQXB','G-2ZYSF0173P','ca-pub-9767176956440077','static.cloudflareinsights.com/beacon.min.js','https://nanalab.kr/apps/']:
        assert marker in text,(name,marker)
    # A reader does not need JS to discover the localized app and its actual limits.
    if lang!='ko':
        visible=re.sub(r'<script\b[^>]*>.*?</script>','',text,flags=re.S)
        visible=re.sub(r'<nav class="language-switcher".*?</nav>','',visible,flags=re.S)
        assert not re.search('[가-힣]',visible),(name,'Untranslated Korean')
        assert strings[data['kind']+'Name'] in text
        assert strings['privacyBody'] in text
    runtime=json.loads(re.search(r'<script id="app-locale" type="application/json">(.*?)</script>',text,re.S)[1])
    assert runtime=={'language':lang,'messages':strings}
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
tree=ET.parse(ROOT/'sitemap.xml');urls=[n.text for n in tree.findall('s:url/s:loc',ns)]
assert tree.getroot().tag=='{'+ns['s']+'}urlset' and len(urls)==9 and set(urls)==set(expected.values())
assert not re.search('[가-힣]',(ROOT/'app.js').read_text(encoding='utf-8'))
print(json.dumps({'status':'passed','languages':len(LANGS),'translation_keys':len(keys),'pages':9,'canonical_hreflang_sitemap':'passed','assets_and_publisher_tags':'passed'}))
