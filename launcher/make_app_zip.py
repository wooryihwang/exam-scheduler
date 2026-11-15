# -*- coding: utf-8 -*-
"""웹판 파일을 오프라인용으로 고쳐 app.zip 으로 묶는다 (build.bat 에서 호출).

- index.html, css/, js/ 를 복사한다 (tests, 발표자료, serve.py 등은 제외).
- 인터넷에서 불러오던 엑셀(SheetJS)·PDF(jsPDF, html2canvas) 모듈과 Pretendard 글꼴을 vendor/ 사본으로 바꾼다.
- Noto Serif KR(구글 글꼴)은 일부 제목에만 쓰이고 대체 글꼴(나눔명조·바탕)이 있어 오프라인판에서는 뺀다.
- 바꾼 뒤에도 외부 주소가 남아 있으면 빌드를 멈춘다.
"""
import os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VENDOR = os.path.join(HERE, 'vendor')
OUT = os.path.join(HERE, 'app.zip')

REPLACE = {
    'index.html': [
        ('<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">',
         '<link rel="stylesheet" href="vendor/pretendardvariable.css">'),
        ('<link rel="preconnect" href="https://fonts.googleapis.com">', ''),
        ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap">', ''),
        ('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>',
         '<script src="vendor/xlsx.full.min.js"></script>'),
    ],
    'js/outputs.js': [
        ("'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'", "'vendor/html2canvas.min.js'"),
        ("'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'", "'vendor/jspdf.umd.min.js'"),
    ],
}
VENDOR_FILES = ['xlsx.full.min.js', 'jspdf.umd.min.js', 'html2canvas.min.js', 'PretendardVariable.woff2', 'LICENSE-pretendard.txt']
EXTERNAL = re.compile(r'https?://(?!www\.w3\.org/)[^\s"\'<>)]+')


def app_files():
    yield 'index.html'
    for sub in ('css', 'js'):
        for name in sorted(os.listdir(os.path.join(ROOT, sub))):
            if name.endswith(('.css', '.js')):
                yield f'{sub}/{name}'


def main():
    problems = []
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in app_files():
            text = open(os.path.join(ROOT, rel), encoding='utf-8').read()
            for a, b in REPLACE.get(rel, []):
                if a not in text:
                    sys.exit(f'[오류] {rel} 에서 바꿀 문구를 찾지 못했습니다: {a[:70]}')
                text = text.replace(a, b)
            for m in EXTERNAL.finditer(text):
                if rel.endswith('.js') and ('sheetjs' in m.group(0) or 'github.com' in m.group(0)):
                    continue                                  # 안내 문구 속 주소(불러오지 않음)
                problems.append(f'{rel}: {m.group(0)}')
            z.writestr(rel, text.encode('utf-8'))
        css = open(os.path.join(VENDOR, 'pretendardvariable.min.css'), encoding='utf-8').read()
        css = re.sub(r"url\('[^']*PretendardVariable\.woff2'\)", "url('PretendardVariable.woff2')", css)
        if "url('PretendardVariable.woff2')" not in css:
            sys.exit('[오류] Pretendard 글꼴 경로를 바꾸지 못했습니다')
        z.writestr('vendor/pretendardvariable.css', css.encode('utf-8'))
        for name in VENDOR_FILES:
            z.write(os.path.join(VENDOR, name), f'vendor/{name}')
    if problems:
        os.remove(OUT)
        sys.exit('[오류] 외부 주소가 남아 있습니다:\n  ' + '\n  '.join(problems))
    with zipfile.ZipFile(OUT) as z:
        print(f'app.zip: {len(z.namelist())}개 파일, {os.path.getsize(OUT) / 1024 / 1024:.1f}MB')


if __name__ == '__main__':
    main()
