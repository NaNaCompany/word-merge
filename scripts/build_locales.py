"""Generate static, crawlable language pages. Python standard library only."""
from pathlib import Path
import argparse, json, re
from html import escape
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = {'ko':'한국어','en':'English','ja':'日本語','zh':'中文','es':'Español','de':'Deutsch','fr':'Français','pt':'Português','ru':'Русский'}
NS='http://www.sitemaps.org/schemas/sitemap/0.9'

def outputs():
    config=json.loads((ROOT/'content/locales.json').read_text(encoding='utf-8'))
    source=(ROOT/'content/index.ko.html').read_text(encoding='utf-8')
    slug,kind=config['slug'],config['kind']
    base=f'https://nanalab.kr/{slug}/'
    urls={lang:base+('' if lang=='ko' else lang+'/') for lang in LANGUAGES}
    rendered={}
    for lang in LANGUAGES:
        d=config['messages'][lang]
        def s(key): return escape(d[key],quote=True)
        name=s(kind+'Name');lead=s(kind+'Lead')
        directory='https://nanalab.kr/'+('' if lang=='ko' else lang+'/')
        head=source.split('</head>')[0]
        head=re.sub(r'<html lang="[^"]+"',f'<html lang="{lang}"',head)
        head=re.sub(r'<title>.*?</title>',f'<title>{name} | NaNa Lab</title>',head,flags=re.S)
        def meta(match):
            tag=match.group()
            if re.search(r'(?:name|property)="(?:description|og:description)"',tag):
                return re.sub(r'content="[^"]*"',f'content="{lead}"',tag)
            if 'property="og:title"' in tag:return re.sub(r'content="[^"]*"',f'content="{name} | NaNa Lab"',tag)
            if 'property="og:url"' in tag:return re.sub(r'content="[^"]*"',f'content="{urls[lang]}"',tag)
            return tag
        head=re.sub(r'<meta\b[^>]*>',meta,head)
        head=re.sub(r'<link rel="canonical" href="[^"]*">',f'<link rel="canonical" href="{urls[lang]}">',head)
        schema={'@context':'https://schema.org','@type':'WebApplication','name':d[kind+'Name'],
                'description':d[kind+'Lead'],'url':urls[lang],'inLanguage':lang,
                'applicationCategory':'UtilitiesApplication','operatingSystem':'Any',
                'offers':{'@type':'Offer','price':'0','priceCurrency':'KRW'}}
        head=re.sub(r'<script type="application/ld\+json">.*?</script>',
                    '<script type="application/ld+json">'+json.dumps(schema,ensure_ascii=False)+'</script>',head,flags=re.S)
        # Shared files have absolute app paths, independent of the locale directory.
        head=re.sub(r'(src|href)="((?:vendor/)?(?:qrcode\.min\.js|jszip\.min\.js|pdf-lib\.min\.js|core\.js|app\.js|style\.css))[^\"]*"',
                    lambda m:f'{m[1]}="{base}{m[2]}?v=20261026i18n1"',head)
        alternate=''.join(f'<link rel="alternate" hreflang="{code}" href="{url}">' for code,url in urls.items())
        alternate+=f'<link rel="alternate" hreflang="x-default" href="{base}">'
        payload=json.dumps({'language':lang,'messages':d},ensure_ascii=False).replace('<','\\u003c')
        head+=alternate+f'<script id="app-locale" type="application/json">{payload}</script><script defer src="{base}i18n.js?v=20261026i18n1"></script>'
        # Deferred scripts execute in document order; initialize localization before app.js.
        app_tag=re.search(r'<script defer src="[^"]*/app\.js[^\"]*"></script>',head)
        assert app_tag
        head=head.replace(app_tag[0],'')+app_tag[0]
        publisher_body=source.split('<body data-tool="'+kind+'">',1)[1].split('<a class="skip"',1)[0]
        publisher_foot='<!-- NaNa publisher: Cloudflare fallback -->'+source.split('<!-- NaNa publisher: Cloudflare fallback -->',1)[1].split('</body>',1)[0]
        nav=f'<a class="skip" href="#main">{s("skip")}</a><header class="topbar"><a class="brand" href="{directory}"><span class="brand-mark" aria-hidden="true">N</span>NaNa Lab</a><nav aria-label="{s("how")}"><a href="#how-it-works">{s("how")}</a><a href="#faq">{s("faq")}</a><a href="{directory}apps/">{s("apps")}</a></nav></header>'
        hero=f'<section class="hero"><p class="eyebrow">NaNa Lab / {kind.upper()}</p><h1>{name}</h1><p class="lead">{lead}</p><div class="badges">'+''.join(f'<span class="badge">{s(key)}</span>' for key in ['free','noSignup','local'])+'</div></section>'
        if kind in ('pdf','word'):
            consent=f'<label class="check"><input id="flatten-forms" type="checkbox"><span>{s("pdfConsent")}</span></label>' if kind=='pdf' else ''
            tool=f'''<div class="workspace"><section class="panel" id="tool-panel" aria-labelledby="file-heading"><h2 id="file-heading"><span class="step">1</span>{s('choose')}</h2><div class="drop" id="drop-zone"><span class="upload-icon" aria-hidden="true">↥</span><strong>{s(kind+'Drop')}</strong><p class="hint">{s(kind+'Limits')}</p><input id="file-input" type="file" accept=".{kind if kind=='pdf' else 'docx'}" multiple hidden><button type="button" class="button primary" id="browse-button">{s('choose')}</button></div><p class="hint" id="selection-count">{s('noFiles')}</p><ol class="file-list" id="file-list" aria-label="{s('fileList')}"></ol><div class="field"><label for="output-name">{s('filename')}</label><input id="output-name" value="{s('defaultName')}" maxlength="100"></div>{consent}<div class="actions"><button class="button primary" id="merge-button" type="button" disabled>{name}</button><button class="button" type="button" id="clear-button" disabled>{s('clear')}</button></div><p class="status" id="status" role="status" aria-live="polite"></p><section class="result" id="result" aria-label="{s('resultLabel')}" hidden><h3>{s('ready')}</h3><p id="result-details"></p><a class="button primary" id="download" download>{s('download')}</a></section></section><aside class="panel aside"><h2>{s('instructions')}</h2><ol>'''+''.join(f'<li>{s(key)}</li>' for key in ['step1','step2','step3'])+f'</ol><p class="note">{s(kind+"Note")}</p><p class="note">{s("local")}</p></aside></div>'
            guidance=[('how',kind+'Help'),('faq',kind+'Note')]
            if kind=='word':guidance.append(('faq','wordReview'))
        else:
            def field(label,id,type='text'):
                return f'<div class="field"><label for="{id}">{s(label)}</label><input id="{id}" type="{type}" autocomplete="off" spellcheck="false"></div>'
            tool=f'''<div class="workspace qr-workspace"><section class="panel"><h2>{s('qrContent')}</h2><form id="qr-form" novalidate><div class="kind-tabs" aria-label="{s('qrContent')}">'''+''.join(f'<button type="button" class="kind-tab" data-kind="{type}" aria-pressed="{str(type=="url").lower()}">{s(label) if label!="wifi" else "Wi-Fi"}</button>' for type,label in [('url','website'),('text','text'),('wifi','wifi')])+f'''</div><div id="text-fields" class="field"><label id="content-label" for="content">{s('urlLabel')}</label><textarea id="content" placeholder="https://example.com" spellcheck="false" autocomplete="off" maxlength="2000"></textarea></div><div id="wifi-fields" hidden>{field('ssid','wifi-ssid')}<div class="field"><label for="wifi-auth">{s('auth')}</label><select id="wifi-auth"><option value="WPA">{s('personal')}</option><option value="WEP">WEP</option><option value="nopass">{s('open')}</option></select></div>{field('password','wifi-password','password')}<label class="check"><input type="checkbox" id="wifi-hidden"><span>{s('hidden')}</span></label><p class="hint">{s('wifiNotice')}</p></div><div class="field"><label for="size">{s('size')}</label><select id="size"><option value="256">{s('size256')}</option><option value="512" selected>{s('size512')}</option><option value="1024">{s('size1024')}</option></select><p class="hint">{s('sizeNote')}</p></div><div class="field"><label for="ecc">{s('ecc')}</label><select id="ecc"><option value="M">{s('eccM')}</option><option value="Q">{s('eccQ')}</option><option value="H">{s('eccH')}</option></select></div><div class="actions"><button type="submit" class="button primary">{name}</button><button type="button" class="button" id="reset-button">{s('reset')}</button></div><p class="status" id="status" role="status" aria-live="polite"></p></form></section><section class="panel qr-output" aria-labelledby="qr-heading"><h2 id="qr-heading">{s('myQr')}</h2><div class="qr-empty" id="qr-empty"><p>{s('empty1')}<br>{s('empty2')}</p></div><div id="qr-result" hidden><canvas id="qr-canvas" role="img" aria-label="{s('qrAlt')}"></canvas><p class="result-meta" id="qr-details"></p><div class="actions"><a class="button primary" id="save-png" download="nana-qr-code.png" aria-disabled="true">{s('png')}</a><a class="button" id="save-svg" download="nana-qr-code.svg" aria-disabled="true">{s('svg')}</a></div></div><p class="hint">{s('staticNote')}</p></section></div>'''
            guidance=[('how','qrHelp'),('faq','qrNote')]
        faq=''.join(f'<details open><summary>{s(title)}</summary><p>{s(body)}</p></details>' for title,body in guidance)
        tail=f'<section class="panel faq" id="how-it-works"><h2 id="faq">{s("faq")}</h2>{faq}</section><section class="panel privacy" id="privacy"><h2>{s("privacy")}</h2><p>{s("privacyBody")}</p><p>{s("disclaimer")} <a href="{directory}#contact">{s("contact")}</a></p></section>'
        menu=f'<nav class="language-switcher" aria-label="{s("language")}">'+''.join(f'<a href="{urls[code]}" lang="{code}" hreflang="{code}"'+(' aria-current="page"' if code==lang else '')+f'>{label}</a>' for code,label in LANGUAGES.items())+'</nav>'
        footer=f'<footer class="footer"><span>© 2026 NaNa Lab</span><span><a href="#privacy">{s("privacy")}</a><a href="{base}THIRD_PARTY_NOTICES.md">{s("license")}</a></span>{menu}</footer><div id="nana-more-apps"><a href="https://nanalab.kr/apps/">More Apps</a></div>'
        if lang=='ko':
            body=source.split('</head>',1)[1]
            body=body.replace('</footer>',menu+'</footer>')
            body=re.sub(r'<script defer src="(?:[^\"]*/)?(?:core|app)\.js[^\"]*"></script>','',body)
            markup=head+'</head>'+body
        else:
            markup=head+f'</head><body data-tool="{kind}">'+publisher_body+nav+'<main id="main">'+hero+f'<noscript><section class="panel"><p>{s("js")}</p></section></noscript>'+tool+tail+'</main>'+footer+publisher_foot+'</body></html>'
        rendered[('' if lang=='ko' else lang+'/')+'index.html']=markup
    ET.register_namespace('',NS)
    urlset=ET.Element('{'+NS+'}urlset')
    for url in urls.values():
        entry=ET.SubElement(urlset,'{'+NS+'}url');ET.SubElement(entry,'{'+NS+'}loc').text=url
    rendered['sitemap.xml']='<?xml version="1.0" encoding="UTF-8"?>\n'+ET.tostring(urlset,encoding='unicode')+'\n'
    return rendered

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    generated=outputs()
    for name,text in generated.items():
        path=ROOT/name
        if args.check:
            assert path.is_file() and path.read_text(encoding='utf-8')==text,'Stale locale file: '+name
        else:
            path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8',newline='\n')
    print(json.dumps({'status':'checked' if args.check else 'built','localized_pages':len(generated)-1,'sitemap_urls':len(generated)-1}))

if __name__=='__main__':main()
