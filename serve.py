"""고사 시간표·배치 도우미 로컬 서버

브라우저가 예전 파일을 캐시해서 새 기능이 보이지 않는 문제를 막기 위해
모든 응답에 '캐시하지 말 것' 헤더를 붙여 이 폴더를 제공한다.

실행: python exam-web/serve.py   (기본 포트 8765, 다른 포트: python exam-web/serve.py 9000)
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"고사 시간표·배치 도우미: http://localhost:{port}  (종료: Ctrl+C)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
