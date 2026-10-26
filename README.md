# Word 합치기

여러 DOCX 문서를 하나의 Word 파일로 합치세요. 문단·표·사진을 담은 문서를 원하는 순서로 이어 붙입니다.

Production: https://nanalab.kr/word-merge/

This is a new standalone app, not a modification or redirect of a legacy application. Buildless static HTML/CSS/JavaScript, hosted on GitHub Pages. Processing dependencies are vendored locally; source files and QR values are never uploaded. Publisher tags report ordinary page activity only.

## Supported scope

- 문단·표·삽입 이미지 결합
- 문서별 구역·용지 크기 유지
- 목록 번호·스타일 ID 충돌 처리

일반 DOCX만 지원합니다. .doc, HWP, 암호·전자서명·변경 추적·메모·삽입 객체가 있는 파일은 Word에서 먼저 정리하세요.

## Validation

Install development dependencies with `npm install --ignore-scripts`, then run `npm test`. Synthetic test fixtures contain no personal material. Verify file ordering, output structure, error paths, and real browser downloads before deployment. Production has no Node.js dependency.

## Languages

Korean remains at the root. English, Japanese, Chinese, Spanish, German, French, Portuguese and Russian have static pages under `/en/`, `/ja/`, `/zh/`, `/es/`, `/de/`, `/fr/`, `/pt/`, `/ru/`. The footer links all nine versions. Each page has a self canonical and reciprocal hreflang links; the app sitemap lists all nine URLs. No language redirect discards the current file selection.

Edit `content/index.ko.html` for the Korean shell and `content/locales.json` for translations. Run `python scripts/build_locales.py` then `python scripts/check_locales.py`; use `--check` on the build script in CI. Shared processing and publisher scripts remain local to this independent app.
