import http.server
import socketserver
import time
import webbrowser
import sys
from threading import Thread

def start_server():
    PORT = 1337

    Handler = http.server.SimpleHTTPRequestHandler
    Handler.extensions_map.update({
            '.manifest': 'text/cache-manifest',
            '.html': 'text/html',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.svg':	'image/svg+xml',
            '.css':	'text/css',
            '.js':'application/javascript',
            '.wasm': 'application/wasm',
            '.json': 'application/json',
            '.xml': 'application/xml',
        })

    sys.stdout.write(f'Serving at localhost:${PORT}...')
    httpd = socketserver.ThreadingTCPServer(("", PORT), Handler)
    httpd.serve_forever()

t=Thread(target=start_server)
t.start()

time.sleep(4)

webbrowser.open('http://localhost:1337/', new=1)
