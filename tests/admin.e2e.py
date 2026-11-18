# Painel: fluxo completo com Google e API simulados. Requer o site em http://127.0.0.1:8765 e /tmp/antes.jpg, /tmp/depois.jpg.
import json,base64,io
from PIL import Image
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:8765/admin/";API="https://api.test/exec";CID="cid.apps.googleusercontent.com"
GIS="""window.google={accounts:{id:{initialize:o=>{window.__cb=o.callback},renderButton:el=>{const b=document.createElement('button');b.id='fake-g';b.textContent='Entrar com Google';b.onclick=()=>window.__cb({credential:'x'.repeat(40)});el.appendChild(b)},disableAutoSelect:()=>{},prompt:()=>{}}}};"""
IMG="/assets/trabalhos/sofa-01-antes.webp"
state={"precos":[{"categoria":"Estofados","servico":"Sofá","min":150,"max":300,"unidade":""}],"promo":{"ativo":True,"titulo":"Carpete a partir de","destaque":"R$ 12/m²","texto":"t","mensagem":"m"},"trabalhos":[]}
calls=[];mode={"err":None}
def handle(route):
    req=json.loads(route.request.post_data);calls.append(req);a=req["action"];pl=req["payload"]
    if mode["err"]: return route.fulfill(body=json.dumps({"ok":False,"error":{"code":mode["err"],"message":"msg "+mode["err"]}}),content_type="application/json",headers={"Access-Control-Allow-Origin":"*"})
    if a=="addTrabalho":
        for k in ("antes","depois"):
            im=Image.open(io.BytesIO(base64.b64decode(pl[k]["b64"])));assert im.size==(1200,800) and im.format=="JPEG",(im.size,im.format)
        state["trabalhos"].insert(0,{"id":str(len(calls)),"item":pl["item"],"local":pl["local"],"problema":pl["problema"],"ativo":True,"antes":IMG,"depois":IMG})
    if a=="savePrecos": state["precos"]=pl["precos"]
    if a=="savePromo": state["promo"]=pl["promo"]
    if a=="updateTrabalho":
        t=[t for t in state["trabalhos"] if t["id"]==pl["id"]][0];t.update(item=pl["item"],ativo=pl["ativo"])
    if a=="reorderTrabalhos": d={t["id"]:t for t in state["trabalhos"]};state["trabalhos"]=[d[i] for i in pl["ids"]]
    if a=="deleteTrabalho": state["trabalhos"]=[t for t in state["trabalhos"] if t["id"]!=pl["id"]]
    route.fulfill(body=json.dumps({"ok":True,"data":dict(state,email="kong@gmail.com")}),content_type="application/json",headers={"Access-Control-Allow-Origin":"*"})
def vis(pg): return [v for v in ["config","login","loading","denied","app"] if pg.is_visible("#v-"+v)]
with sync_playwright() as p:
    b=p.chromium.launch();errs=[]
    # 1) sem configuração
    pg=b.new_page();pg.on("pageerror",lambda e:errs.append(str(e)));pg.route("https://accounts.google.com/**",lambda r:r.fulfill(body=GIS,content_type="text/javascript"))
    pg.route("**/config.js*",lambda r:r.fulfill(body='window.SHC_CONFIG={api:"",clientId:""};',content_type="text/javascript"))
    pg.goto(BASE);pg.wait_for_timeout(500);print("1 sem config:",vis(pg))
    # 2) login
    pg=b.new_page(viewport={"width":390,"height":844});pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.route("**/config.js*",lambda r:r.fulfill(body=f'window.SHC_CONFIG={{api:"{API}",clientId:"{CID}"}};',content_type="text/javascript"))
    pg.route("https://accounts.google.com/**",lambda r:r.fulfill(body=GIS,content_type="text/javascript"));pg.route(API+"*",handle)
    pg.goto(BASE);pg.wait_for_timeout(600);print("2 antes do login:",vis(pg));pg.screenshot(path="/tmp/adm_login.png")
    pg.click("#fake-g");pg.wait_for_timeout(600);print("  depois do login:",vis(pg),pg.text_content("#email"),"| token enviado:",len(calls[-1]["idToken"]))
    # 3) novo trabalho
    pg.click("#n-send");print("3 sem fotos:",pg.text_content("#n-err"))
    pg.set_input_files("#file-antes","/tmp/antes.jpg");pg.set_input_files("#file-depois","/tmp/depois.jpg");pg.wait_for_timeout(500)
    pg.fill("#n-item","Sofá 3 lugares");pg.fill("#n-local","Canoas");pg.click("#n-send");print("  sem conferência:",pg.text_content("#n-err"))
    pg.fill("#f-new input[type=range] >> nth=0","30");pg.dispatch_event("#f-new input[type=range] >> nth=0","input")
    pg.check("#n-priv");pg.screenshot(path="/tmp/adm_new.png",full_page=True);n=len(calls);pg.click("#n-send");pg.wait_for_timeout(1500)
    print("  publicado:",calls[-1]["action"],"| itens:",pg.locator("#list .item").count(),"| toast:",pg.text_content("#toast"),"| form limpo:",pg.input_value("#n-item")=="")
    pg.screenshot(path="/tmp/adm_list.png",full_page=True)
    # 4) preços
    pg.click(".tab[data-tab=precos]");pg.click("#p-add");pg.fill("#prows .prow:last-child [data-f=servico]","Teste");pg.fill("#prows .prow:last-child [data-f=min]","200");pg.fill("#prows .prow:last-child [data-f=max]","99,90")
    n=len(calls);pg.click("#p-save");print("4 mín>máx:",pg.text_content("#p-err"),"| chamou API:",len(calls)>n,"| msg linha:",pg.text_content(".prow.bad .msg"))
    pg.fill("#prows .prow:last-child [data-f=min]","1.500");pg.fill("#prows .prow:last-child [data-f=max]","1.500,50");pg.click("#p-save");pg.wait_for_timeout(600)
    print("  salvo:",calls[-1]["payload"]["precos"][-1],"| sujo:",pg.is_visible("#p-dirty"));pg.screenshot(path="/tmp/adm_precos.png",full_page=True)
    # 5) promoção
    pg.click(".tab[data-tab=promo]");pg.uncheck("#m-ativo");print("5 prévia:",pg.text_content("#m-prev-hint"));pg.fill("#m-titulo","Colchão casal por");pg.fill("#m-dest","R$ 120")
    pg.click("#m-save");pg.wait_for_timeout(500);print("  salvo:",calls[-1]["payload"]["promo"]);pg.screenshot(path="/tmp/adm_promo.png",full_page=True)
    # 6) erros de sessão
    pg.click(".tab[data-tab=trabalhos]");mode["err"]="AUTH";pg.click("#list [data-act=save]");pg.wait_for_timeout(500);print("6 AUTH ->",vis(pg),pg.text_content("#toast"))
    mode["err"]=None;pg.click("#fake-g");pg.wait_for_timeout(500);mode["err"]="FORBIDDEN";pg.click("#list [data-act=save]");pg.wait_for_timeout(500);print("  FORBIDDEN ->",vis(pg))
    print("erros JS:",errs);b.close()
