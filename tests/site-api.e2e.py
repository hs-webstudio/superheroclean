# Site: conteúdo vindo da API (normal, cache, API fora do ar, escape de HTML). Requer o site em http://127.0.0.1:8765.
import json
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:8765/index.html"
API="https://api.test/exec"
DATA={"ok":True,"data":{"precos":[{"categoria":"Sofás","servico":"<img src=x onerror=window.__xss=1>Sofá","min":100,"max":100,"unidade":""},{"categoria":"Carpetes","servico":"Carpete","min":15,"max":40,"unidade":"m²"}],
 "promo":{"ativo":False,"titulo":"x","destaque":"","texto":"","mensagem":"m"},
 "trabalhos":[{"item":"A","local":"Canoas","problema":"p","antes":"assets/trabalhos/sofa-01-antes.webp","depois":"assets/trabalhos/sofa-01-depois.webp"},{"item":"B","local":"","problema":"","antes":"assets/trabalhos/sofa-01-antes.webp","depois":"assets/trabalhos/sofa-01-depois.webp"}]}}
def page(b,api_mode,clear=True,ctx=None):
    ctx=ctx or b.new_context(viewport={"width":1440,"height":860})
    pg=ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    if api_mode!="none":
        pg.route("**/config.js*",lambda r:r.fulfill(body=f'window.SHC_CONFIG={{api:"{API}",clientId:""}};',content_type="text/javascript"))
        def api(r):
            if api_mode=="ok": r.fulfill(body=json.dumps(DATA),content_type="application/json",headers={"Access-Control-Allow-Origin":"*"})
            else: r.fulfill(status=500,body="err",headers={"Access-Control-Allow-Origin":"*"})
        pg.route(API+"*",api)
    pg.goto(BASE+"#precos");pg.wait_for_timeout(1200)
    return ctx,pg,errs
def state(pg):
    return pg.evaluate("""({tabs:[...document.querySelectorAll('#tabs .tab')].map(b=>b.textContent),tabsHidden:document.getElementById('tabs').hidden,
      rows:[...document.querySelectorAll('#plist .price')].map(r=>r.innerText.replace(/\\n/g,' | ')),promoHidden:document.getElementById('promo').hidden,
      promo:document.getElementById('promoTitle').textContent,gal:document.querySelectorAll('.ba').length,empty:!!document.querySelector('.gal-empty'),xss:window.__xss||0})""")
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg,e=page(b,"ok");s=state(pg);print("B com API:",s,e)
    pg.click("#tabs .tab:has-text(\"Carpetes\")");print("   carpete:",state(pg)["rows"])
    # D: mesmo contexto (cache salvo), API cai
    pg2=ctx.new_page();pg2.route("**/config.js*",lambda r:r.fulfill(body=f'window.SHC_CONFIG={{api:"{API}",clientId:""}};',content_type="text/javascript"));pg2.route(API+"*",lambda r:r.fulfill(status=500,body="x",headers={"Access-Control-Allow-Origin":"*"}))
    pg2.goto(BASE);pg2.wait_for_timeout(1200);print("D API caiu c/ cache:",state(pg2))
    ctx,pg,e=page(b,"fail");print("C API caiu s/ cache:",state(pg),e)
    b.close()
