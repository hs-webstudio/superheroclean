/**
 * Super Hero Clean — API de conteúdo do site (preços, promoção e trabalhos).
 *
 * Implantação: app da Web, "Executar como: Eu", "Quem pode acessar: Qualquer pessoa".
 * - GET  -> conteúdo público (somente leitura, em cache).
 * - POST -> ações do painel; exige ID token do Google de um e-mail da aba Admins.
 *
 * Propriedades do script: CLIENT_ID (cliente OAuth "Aplicativo da Web").
 * SHEET_ID e FOLDER_ID são criados por setup().
 */

var HEAD = {
  Admins: ['email'],
  Precos: ['categoria', 'servico', 'min', 'max', 'unidade'],
  Promo: ['ativo', 'titulo', 'destaque', 'texto', 'mensagem'],
  Trabalhos: ['id', 'item', 'local', 'problema', 'antesId', 'depoisId', 'ativo', 'atualizadoEm', 'atualizadoPor']
};
var LIMITS = { maxPrecos: 60, maxTrabalhos: 60, maxImageBytes: 2 * 1024 * 1024 };
var UNIDADES = ['', 'm²'];
var IMAGE_TYPES = ['image/jpeg', 'image/webp', 'image/png'];
var GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
var CACHE_KEY = 'public-content-v1';
var CACHE_SECONDS = 600;

/* ===================== Núcleo (regras puras, testáveis) ===================== */

function AppError(code, message) {
  this.code = code;
  this.message = message;
}

function fail(code, message) {
  throw new AppError(code, message);
}

function cleanText(value, max, label, required) {
  var s = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (required && !s) fail('VALIDATION', label + ' é obrigatório.');
  if (s.length > max) fail('VALIDATION', label + ' passa de ' + max + ' caracteres.');
  return s;
}

function cleanMoney(value, label) {
  var n = typeof value === 'number' ? value : Number(String(value == null ? '' : value).replace(',', '.'));
  if (value === '' || value == null || !isFinite(n) || n < 0 || n > 100000) {
    fail('VALIDATION', label + ' precisa ser um valor entre 0 e 100.000.');
  }
  return Math.round(n * 100) / 100;
}

function cleanBool(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function validatePrecos(rows) {
  if (!Array.isArray(rows) || !rows.length) fail('VALIDATION', 'Inclua pelo menos um preço.');
  if (rows.length > LIMITS.maxPrecos) fail('VALIDATION', 'Máximo de ' + LIMITS.maxPrecos + ' preços.');
  return rows.map(function (r, i) {
    var n = 'Linha ' + (i + 1) + ': ';
    r = r || {};
    var row = {
      categoria: cleanText(r.categoria, 40, n + 'categoria', true),
      servico: cleanText(r.servico, 120, n + 'serviço', true),
      min: cleanMoney(r.min, n + 'valor mínimo'),
      max: cleanMoney(r.max, n + 'valor máximo'),
      unidade: cleanText(r.unidade, 10, n + 'unidade', false)
    };
    if (UNIDADES.indexOf(row.unidade) < 0) fail('VALIDATION', n + 'unidade inválida.');
    if (row.min > row.max) fail('VALIDATION', n + 'o valor mínimo é maior que o máximo.');
    return row;
  });
}

function validatePromo(p) {
  p = p || {};
  return {
    ativo: cleanBool(p.ativo),
    titulo: cleanText(p.titulo, 60, 'Título', true),
    destaque: cleanText(p.destaque, 30, 'Destaque', false),
    texto: cleanText(p.texto, 300, 'Texto', false),
    mensagem: cleanText(p.mensagem, 300, 'Mensagem do WhatsApp', true)
  };
}

function validateTrabalhoText(t) {
  t = t || {};
  return {
    item: cleanText(t.item, 60, 'Item', true),
    local: cleanText(t.local, 60, 'Cidade', false),
    problema: cleanText(t.problema, 120, 'Problema', false)
  };
}

function validateImage(img, label) {
  if (!img || typeof img.b64 !== 'string' || !img.b64) fail('VALIDATION', 'Envie a foto ' + label + '.');
  if (IMAGE_TYPES.indexOf(img.mime) < 0) fail('VALIDATION', 'Foto ' + label + ': formato não aceito.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(img.b64)) fail('VALIDATION', 'Foto ' + label + ': arquivo inválido.');
  if (Math.floor(img.b64.length * 3 / 4) > LIMITS.maxImageBytes) fail('VALIDATION', 'Foto ' + label + ': passa de 2 MB.');
  return { mime: img.mime, b64: img.b64 };
}

function validateOrder(ids, currentIds) {
  if (!Array.isArray(ids) || ids.length !== currentIds.length) fail('VALIDATION', 'Ordem inválida.');
  var seen = {};
  ids.forEach(function (id) {
    if (currentIds.indexOf(id) < 0 || seen[id]) fail('VALIDATION', 'Ordem inválida.');
    seen[id] = true;
  });
  return ids.slice();
}

function normalizeAdmins(rows) {
  return rows.map(function (r) { return String(r.email || '').trim().toLowerCase(); })
    .filter(function (e) { return e.indexOf('@') > 0; });
}

/** Confere os dados do token já validado pelo Google e devolve o e-mail do admin. */
function checkTokenClaims(claims, clientId, admins, nowSeconds) {
  if (!clientId) fail('INTERNAL', 'Painel não configurado (CLIENT_ID).');
  if (!claims || claims.aud !== clientId) fail('AUTH', 'Login inválido. Entre novamente.');
  if (GOOGLE_ISSUERS.indexOf(claims.iss) < 0) fail('AUTH', 'Login inválido. Entre novamente.');
  if (!(claims.email_verified === true || claims.email_verified === 'true')) fail('AUTH', 'E-mail do Google não verificado.');
  if (!(Number(claims.exp) > nowSeconds)) fail('AUTH', 'Sessão expirada. Entre novamente.');
  var email = String(claims.email || '').toLowerCase();
  if (admins.indexOf(email) < 0) fail('FORBIDDEN', 'Este e-mail não tem acesso ao painel.');
  return email;
}

function imageUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1200';
}

function toPrecos(rows) {
  return rows.map(function (r) {
    return { categoria: String(r.categoria), servico: String(r.servico), min: Number(r.min), max: Number(r.max), unidade: String(r.unidade || '') };
  });
}

function toPromo(rows) {
  var p = rows[0];
  if (!p) return { ativo: false, titulo: '', destaque: '', texto: '', mensagem: '' };
  return { ativo: cleanBool(p.ativo), titulo: String(p.titulo), destaque: String(p.destaque), texto: String(p.texto), mensagem: String(p.mensagem) };
}

function toTrabalhoAdmin(r) {
  return {
    id: String(r.id), item: String(r.item), local: String(r.local), problema: String(r.problema),
    ativo: cleanBool(r.ativo), antes: imageUrl(r.antesId), depois: imageUrl(r.depoisId)
  };
}

function buildPublic(precosRows, promoRows, trabalhosRows) {
  return {
    precos: toPrecos(precosRows),
    promo: toPromo(promoRows),
    trabalhos: trabalhosRows.filter(function (r) { return cleanBool(r.ativo); }).map(function (r) {
      return { item: String(r.item), local: String(r.local), problema: String(r.problema), antes: imageUrl(r.antesId), depois: imageUrl(r.depoisId) };
    })
  };
}

/* ===================== Integrações (Apps Script) ===================== */

function doGet() {
  try {
    return json_({ ok: true, data: getPublicCached_() });
  } catch (err) {
    console.error('doGet', err && err.stack || err);
    return json_({ ok: false, error: { code: 'INTERNAL', message: 'Conteúdo indisponível no momento.' } });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData && e.postData.contents || '');
  } catch (x) {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'Requisição inválida.' } });
  }
  var action = String(body && body.action || '');
  try {
    var email = authenticate_(body.idToken);
    return json_({ ok: true, data: route_(action, body.payload || {}, email) });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code !== 'VALIDATION') console.warn('doPost', action, err.code);
      return json_({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('doPost', action, err && err.stack || err);
    return json_({ ok: false, error: { code: 'INTERNAL', message: 'Erro inesperado. Tente de novo em instantes.' } });
  }
}

function route_(action, payload, email) {
  switch (action) {
    case 'getAdminData': return getAdminData_(email);
    case 'savePrecos': return withLock_(function () { writeTable_('Precos', validatePrecos(payload.precos)); return getAdminData_(email); });
    case 'savePromo': return withLock_(function () { writeTable_('Promo', [validatePromo(payload.promo)]); return getAdminData_(email); });
    case 'addTrabalho': return withLock_(function () { addTrabalho_(payload, email); return getAdminData_(email); });
    case 'updateTrabalho': return withLock_(function () { updateTrabalho_(payload, email); return getAdminData_(email); });
    case 'deleteTrabalho': return withLock_(function () { deleteTrabalho_(payload); return getAdminData_(email); });
    case 'reorderTrabalhos': return withLock_(function () { reorderTrabalhos_(payload); return getAdminData_(email); });
    default: fail('VALIDATION', 'Ação desconhecida.');
  }
}

function authenticate_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) fail('AUTH', 'Entre com sua conta Google.');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail('AUTH', 'Sessão expirada. Entre novamente.');
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  return checkTokenClaims(JSON.parse(res.getContentText()), clientId, normalizeAdmins(readTable_('Admins')), Date.now() / 1000);
}

function getAdminData_(email) {
  return {
    email: email,
    precos: toPrecos(readTable_('Precos')),
    promo: toPromo(readTable_('Promo')),
    trabalhos: readTable_('Trabalhos').map(toTrabalhoAdmin)
  };
}

function getPublicCached_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var data = buildPublic(readTable_('Precos'), readTable_('Promo'), readTable_('Trabalhos'));
  data.atualizadoEm = new Date().toISOString();
  cache.put(CACHE_KEY, JSON.stringify(data), CACHE_SECONDS);
  return data;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail('BUSY', 'Outra alteração está em andamento. Tente de novo.');
  try {
    var out = fn();
    CacheService.getScriptCache().remove(CACHE_KEY);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function addTrabalho_(payload, email) {
  var rows = readTable_('Trabalhos');
  if (rows.length >= LIMITS.maxTrabalhos) fail('VALIDATION', 'Limite de ' + LIMITS.maxTrabalhos + ' trabalhos. Exclua algum antigo.');
  var t = validateTrabalhoText(payload);
  var antes = validateImage(payload.antes, 'do antes');
  var depois = validateImage(payload.depois, 'do depois');
  var folder = DriveApp.getFolderById(prop_('FOLDER_ID'));
  var id = Utilities.getUuid();
  var fa = saveImage_(folder, antes, id + '-antes');
  var fd;
  try {
    fd = saveImage_(folder, depois, id + '-depois');
  } catch (err) {
    fa.setTrashed(true);
    throw err;
  }
  rows.unshift({
    id: id, item: t.item, local: t.local, problema: t.problema, antesId: fa.getId(), depoisId: fd.getId(),
    ativo: true, atualizadoEm: new Date().toISOString(), atualizadoPor: email
  });
  writeTable_('Trabalhos', rows);
}

function saveImage_(folder, img, name) {
  var ext = img.mime.split('/')[1];
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(img.b64), img.mime, name + '.' + ext));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function updateTrabalho_(payload, email) {
  var rows = readTable_('Trabalhos');
  var row = findRow_(rows, payload.id);
  var t = validateTrabalhoText(payload);
  row.item = t.item;
  row.local = t.local;
  row.problema = t.problema;
  row.ativo = cleanBool(payload.ativo);
  row.atualizadoEm = new Date().toISOString();
  row.atualizadoPor = email;
  writeTable_('Trabalhos', rows);
}

function deleteTrabalho_(payload) {
  var rows = readTable_('Trabalhos');
  var row = findRow_(rows, payload.id);
  var folderId = prop_('FOLDER_ID');
  [row.antesId, row.depoisId].forEach(function (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      if (file.getParents().hasNext() && file.getParents().next().getId() === folderId) file.setTrashed(true);
    } catch (err) {
      console.warn('deleteTrabalho: arquivo não encontrado', fileId);
    }
  });
  writeTable_('Trabalhos', rows.filter(function (r) { return r !== row; }));
}

function reorderTrabalhos_(payload) {
  var rows = readTable_('Trabalhos');
  var byId = {};
  rows.forEach(function (r) { byId[r.id] = r; });
  var ids = validateOrder(payload.ids, rows.map(function (r) { return r.id; }));
  writeTable_('Trabalhos', ids.map(function (id) { return byId[id]; }));
}

function findRow_(rows, id) {
  var found = rows.filter(function (r) { return r.id === String(id || ''); })[0];
  if (!found) fail('NOT_FOUND', 'Trabalho não encontrado. Atualize a página.');
  return found;
}

function sheet_(name) {
  var sh = SpreadsheetApp.openById(prop_('SHEET_ID')).getSheetByName(name);
  if (!sh) fail('INTERNAL', 'Aba "' + name + '" não encontrada na planilha.');
  return sh;
}

function readTable_(name) {
  var values = sheet_(name).getDataRange().getValues();
  var head = HEAD[name];
  return values.slice(1).filter(function (v) {
    return v.some(function (c) { return c !== '' && c !== null; });
  }).map(function (v) {
    var o = {};
    head.forEach(function (h, i) { o[h] = v[i] === undefined ? '' : v[i]; });
    return o;
  });
}

function writeTable_(name, rows) {
  var sh = sheet_(name);
  var head = HEAD[name];
  var values = [head].concat(rows.map(function (r) { return head.map(function (h) { return r[h] === undefined ? '' : r[h]; }); }));
  sh.clearContents();
  sh.getRange(1, 1, values.length, head.length).setValues(values);
}

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) fail('INTERNAL', 'Painel não configurado (' + key + '). Rode setup().');
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Configuração (rodar uma vez no editor) ===================== */

/** Cria a planilha e a pasta, preenche com o conteúdo atual do site e cadastra você como admin. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    console.log('Já configurado. Planilha: https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'));
    return;
  }
  var ss = SpreadsheetApp.create('Super Hero Clean – Conteúdo do site');
  var first = ss.getSheets()[0];
  Object.keys(HEAD).forEach(function (name, i) {
    var sh = i === 0 ? first.setName(name) : ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var folder = DriveApp.createFolder('Super Hero Clean – Fotos do site');
  props.setProperties({ SHEET_ID: ss.getId(), FOLDER_ID: folder.getId() });

  writeTable_('Admins', [{ email: Session.getEffectiveUser().getEmail() }]);
  writeTable_('Precos', SEED_PRECOS);
  writeTable_('Promo', [SEED_PROMO]);
  console.log('Planilha: ' + ss.getUrl());
  console.log('Pasta: ' + folder.getUrl());
}

var SEED_PRECOS = [
  { categoria: 'Estofados', servico: 'Sofá 2 a 3 lugares', min: 150, max: 300, unidade: '' },
  { categoria: 'Estofados', servico: 'Sofá retrátil / reclinável', min: 250, max: 500, unidade: '' },
  { categoria: 'Estofados', servico: 'Sofá de canto / em L', min: 450, max: 800, unidade: '' },
  { categoria: 'Estofados', servico: 'Poltrona ou cadeira estofada', min: 80, max: 200, unidade: '' },
  { categoria: 'Veículos', servico: 'Higienização interna completa', min: 290, max: 450, unidade: '' },
  { categoria: 'Veículos', servico: 'Parcial (apenas bancos)', min: 80, max: 150, unidade: '' },
  { categoria: 'Veículos', servico: 'Bancos de couro (limpeza + hidratação)', min: 100, max: 180, unidade: '' },
  { categoria: 'Veículos', servico: 'Teto', min: 100, max: 250, unidade: '' },
  { categoria: 'Colchões', servico: 'Solteiro', min: 70, max: 110, unidade: '' },
  { categoria: 'Colchões', servico: 'Casal padrão', min: 130, max: 230, unidade: '' },
  { categoria: 'Colchões', servico: 'Queen / King size', min: 140, max: 350, unidade: '' },
  { categoria: 'Carpetes', servico: 'Carpete', min: 12, max: 45, unidade: 'm²' }
];

var SEED_PROMO = {
  ativo: true,
  titulo: 'Carpete a partir de',
  destaque: 'R$ 12/m²',
  texto: 'Ar mais puro e fibras protegidas. Informe a metragem e receba o valor.',
  mensagem: 'Olá! Quero higienizar meu carpete (promoção R$ 12/m²).'
};
