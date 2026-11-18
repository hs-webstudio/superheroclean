# Painel: lembrar o aparelho (login automático) e sair. Requer o site em http://127.0.0.1:8765.
import json, sys
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8765/admin/"; API = "https://api.test/exec"
GIS = """window.__prompts=0;window.google={accounts:{id:{initialize:o=>{window.__cb=o.callback;window.__auto=o.auto_select},
renderButton:el=>{const b=document.createElement('button');b.id='fake-g';b.onclick=()=>window.__cb({credential:'x'.repeat(40)});el.appendChild(b)},
prompt:()=>{window.__prompts++;setTimeout(()=>window.__cb({credential:'y'.repeat(40)}),50)},disableAutoSelect:()=>{window.__disabled=1}}}};"""
DATA = {"email": "kong@gmail.com", "precos": [], "promo": {"ativo": False}, "trabalhos": []}
mode = {"err": None}
def api(r):
    body = {"ok": False, "error": {"code": mode["err"], "message": "x"}} if mode["err"] else {"ok": True, "data": DATA}
    if mode["err"] == "AUTH": mode["err"] = None  # só a primeira chamada falha (token vencido)
    r.fulfill(body=json.dumps(body), content_type="application/json", headers={"Access-Control-Allow-Origin": "*"})
ok = True
def check(name, cond):
    global ok; ok = ok and cond; print(("OK   " if cond else "FALHOU ") + name)
def vis(pg): return [v for v in ["config", "login", "loading", "denied", "app"] if pg.is_visible("#v-" + v)]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); pg = ctx.new_page()
    pg.route("**/config.js*", lambda r: r.fulfill(body=f'window.SHC_CONFIG={{api:"{API}",clientId:"cid"}};', content_type="text/javascript"))
    pg.route("https://accounts.google.com/**", lambda r: r.fulfill(body=GIS, content_type="text/javascript")); pg.route(API + "*", api)
    pg.goto(BASE); pg.wait_for_timeout(500)
    check("1º acesso pede login e não tenta entrar sozinho", vis(pg) == ["login"] and pg.evaluate("__prompts") == 0)
    check("login automático habilitado no Google", pg.evaluate("__auto") is True)
    pg.click("#fake-g"); pg.wait_for_timeout(400)
    check("após login, aparelho marcado e nenhum token salvo",
          vis(pg) == ["app"] and pg.evaluate("localStorage.getItem('shc-admin-device')") == "1"
          and "x" * 40 not in pg.evaluate("JSON.stringify(localStorage)+document.cookie"))
    pg.reload(); pg.wait_for_timeout(600)
    check("ao reabrir, entra sozinho", vis(pg) == ["app"] and pg.evaluate("__prompts") == 1)
    mode["err"] = "AUTH"; pg.click(".tab[data-tab=promo]"); pg.fill("#m-titulo", "T"); pg.fill("#m-msg", "M"); pg.click("#m-save"); pg.wait_for_timeout(600)
    check("sessão vencida renova sozinha", vis(pg) == ["app"] and pg.evaluate("__prompts") == 2)
    pg.click("#logout"); pg.wait_for_timeout(200)
    check("Sair esquece o aparelho", vis(pg) == ["login"] and pg.evaluate("localStorage.getItem('shc-admin-device')") is None and pg.evaluate("window.__disabled") == 1)
    pg.reload(); pg.wait_for_timeout(500)
    check("depois de sair, não entra sozinho", vis(pg) == ["login"] and pg.evaluate("__prompts") == 0)
    pg.click("#fake-g"); pg.wait_for_timeout(400); pg.click(".tab[data-tab=promo]")
    pg.fill("#m-titulo", "T"); pg.fill("#m-msg", "M"); mode["err"] = "FORBIDDEN"; pg.click("#m-save"); pg.wait_for_timeout(400)
    check("acesso retirado: mostra 'sem acesso' e esquece o aparelho", vis(pg) == ["denied"] and pg.evaluate("localStorage.getItem('shc-admin-device')") is None)
    b.close()
sys.exit(0 if ok else 1)
