# Regressão: abrir o site no PC com âncora (#precos) não pode deixar a página em branco.
# Rodar com o site servido em http://127.0.0.1:8765 (python3 -m http.server 8765).
import sys
from playwright.sync_api import sync_playwright
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    for h in ["precos", "contato", "porque"]:
        pg = b.new_page(viewport={"width": 1150, "height": 687})
        pg.route("**/config.js*", lambda r: r.fulfill(body="window.SHC_CONFIG={api:'',clientId:''};", content_type="text/javascript"))
        pg.goto(f"http://127.0.0.1:8765/index.html#{h}")
        pg.wait_for_timeout(1500)
        x = pg.evaluate(f"Math.round(document.getElementById('{h}').getBoundingClientRect().x)")
        sl = pg.evaluate("document.querySelector('.view').scrollLeft")
        print(h, "x =", x, "scrollLeft =", sl, "OK" if x == 0 else "FALHOU")
        ok = ok and x == 0
    b.close()
sys.exit(0 if ok else 1)
