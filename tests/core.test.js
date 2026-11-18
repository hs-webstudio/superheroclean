// Testes das regras puras do apps-script/Code.gs. Rodar: node tests/core.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
const C = ctx;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FALHOU:', name, '\n ', e.message); process.exitCode = 1; }
}
function throwsCode(fn, code, msgPart) {
  try { fn(); } catch (e) {
    assert.strictEqual(e.code, code, `código ${e.code} != ${code} (${e.message})`);
    if (msgPart) assert.ok(e.message.includes(msgPart), `mensagem "${e.message}" sem "${msgPart}"`);
    return;
  }
  assert.fail(`esperava erro ${code}`);
}

// ---- preços
test('preços válidos são normalizados', () => {
  const r = C.validatePrecos([{ categoria: '  Estofados ', servico: 'Sofá', min: '150', max: '300,5', unidade: '' }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), [{ categoria: 'Estofados', servico: 'Sofá', min: 150, max: 300.5, unidade: '' }]);
});
test('preço mínimo maior que máximo é recusado', () =>
  throwsCode(() => C.validatePrecos([{ categoria: 'A', servico: 'B', min: 10, max: 5, unidade: '' }]), 'VALIDATION', 'mínimo é maior'));
test('preço vazio, negativo ou absurdo é recusado', () => {
  for (const v of ['', null, -1, 'abc', 100001]) {
    throwsCode(() => C.validatePrecos([{ categoria: 'A', servico: 'B', min: v, max: 5, unidade: '' }]), 'VALIDATION', 'Linha 1');
  }
});
test('limites: 0 e 100.000 aceitos', () => {
  const r = C.validatePrecos([{ categoria: 'A', servico: 'B', min: 0, max: 100000, unidade: 'm²' }]);
  assert.strictEqual(r[0].max, 100000);
});
test('unidade fora da lista é recusada', () =>
  throwsCode(() => C.validatePrecos([{ categoria: 'A', servico: 'B', min: 1, max: 2, unidade: 'kg' }]), 'VALIDATION', 'unidade'));
test('lista vazia ou não-lista é recusada', () => {
  throwsCode(() => C.validatePrecos([]), 'VALIDATION');
  throwsCode(() => C.validatePrecos('x'), 'VALIDATION');
});
test('mais de 60 linhas é recusado', () =>
  throwsCode(() => C.validatePrecos(Array(61).fill({ categoria: 'A', servico: 'B', min: 1, max: 2, unidade: '' })), 'VALIDATION', 'Máximo'));
test('texto longo demais é recusado com o número da linha', () =>
  throwsCode(() => C.validatePrecos([{ categoria: 'A', servico: 'x'.repeat(121), min: 1, max: 2, unidade: '' }]), 'VALIDATION', 'Linha 1: serviço'));

// ---- promoção
test('promoção válida', () => {
  const p = C.validatePromo({ ativo: 'true', titulo: 'Carpete', destaque: 'R$ 12/m²', texto: '', mensagem: 'Olá' });
  assert.strictEqual(p.ativo, true);
});
test('promoção sem título ou mensagem é recusada', () => {
  throwsCode(() => C.validatePromo({ titulo: '', mensagem: 'x' }), 'VALIDATION', 'Título');
  throwsCode(() => C.validatePromo({ titulo: 'x', mensagem: ' ' }), 'VALIDATION', 'Mensagem');
});

// ---- trabalhos e imagens
test('trabalho exige item', () => throwsCode(() => C.validateTrabalhoText({ item: '' }), 'VALIDATION', 'Item'));
test('imagem válida passa', () => {
  const img = C.validateImage({ mime: 'image/jpeg', b64: Buffer.from('abc').toString('base64') }, 'do antes');
  assert.strictEqual(img.mime, 'image/jpeg');
});
test('imagem com tipo, conteúdo ou tamanho inválido é recusada', () => {
  throwsCode(() => C.validateImage(null, 'do antes'), 'VALIDATION', 'Envie');
  throwsCode(() => C.validateImage({ mime: 'image/gif', b64: 'QUJD' }, 'do antes'), 'VALIDATION', 'formato');
  throwsCode(() => C.validateImage({ mime: 'image/png', b64: 'QU<script>' }, 'do antes'), 'VALIDATION', 'inválido');
  throwsCode(() => C.validateImage({ mime: 'image/png', b64: 'A'.repeat(2.9 * 1024 * 1024) }, 'do antes'), 'VALIDATION', '2 MB');
});
test('ordem precisa ter exatamente os mesmos ids', () => {
  assert.deepStrictEqual(Array.from(C.validateOrder(['b', 'a'], ['a', 'b'])), ['b', 'a']);
  throwsCode(() => C.validateOrder(['a'], ['a', 'b']), 'VALIDATION');
  throwsCode(() => C.validateOrder(['a', 'a'], ['a', 'b']), 'VALIDATION');
  throwsCode(() => C.validateOrder(['a', 'x'], ['a', 'b']), 'VALIDATION');
});

// ---- autenticação
const CID = 'cid.apps.googleusercontent.com';
const ok = { aud: CID, iss: 'https://accounts.google.com', email: 'Kong@Gmail.com', email_verified: 'true', exp: '2000' };
test('admin com token válido é aceito (e-mail sem diferenciar maiúsculas)', () =>
  assert.strictEqual(C.checkTokenClaims(ok, CID, ['kong@gmail.com'], 1000), 'kong@gmail.com'));
test('token de outro app é recusado', () => throwsCode(() => C.checkTokenClaims({ ...ok, aud: 'outro' }, CID, ['kong@gmail.com'], 1000), 'AUTH'));
test('emissor estranho é recusado', () => throwsCode(() => C.checkTokenClaims({ ...ok, iss: 'evil.com' }, CID, ['kong@gmail.com'], 1000), 'AUTH'));
test('e-mail não verificado é recusado', () => throwsCode(() => C.checkTokenClaims({ ...ok, email_verified: 'false' }, CID, ['kong@gmail.com'], 1000), 'AUTH', 'verificado'));
test('token expirado é recusado (limite exato)', () => throwsCode(() => C.checkTokenClaims(ok, CID, ['kong@gmail.com'], 2000), 'AUTH', 'expirada'));
test('e-mail fora da lista é proibido', () => throwsCode(() => C.checkTokenClaims(ok, CID, ['outro@gmail.com'], 1000), 'FORBIDDEN'));
test('sem CLIENT_ID configurado dá erro de configuração', () => throwsCode(() => C.checkTokenClaims(ok, null, ['kong@gmail.com'], 1000), 'INTERNAL'));
test('lista de admins ignora linhas vazias e normaliza', () =>
  assert.deepStrictEqual(Array.from(C.normalizeAdmins([{ email: ' A@B.com ' }, { email: '' }, { email: 'semarroba' }])), ['a@b.com']));

// ---- conteúdo público
test('conteúdo público mostra só trabalhos ativos e monta URLs das fotos', () => {
  const d = C.buildPublic(
    [{ categoria: 'A', servico: 'B', min: '1', max: 2, unidade: '' }],
    [{ ativo: 'TRUE', titulo: 'T', destaque: 'D', texto: '', mensagem: 'M' }],
    [{ id: '1', item: 'Sofá', local: '', problema: 'p', antesId: 'x1', depoisId: 'y1', ativo: true },
     { id: '2', item: 'Oculto', local: '', problema: '', antesId: 'x2', depoisId: 'y2', ativo: false }]
  );
  assert.strictEqual(d.precos[0].min, 1);
  assert.strictEqual(d.promo.ativo, true);
  assert.strictEqual(d.trabalhos.length, 1);
  assert.strictEqual(d.trabalhos[0].antes, 'https://drive.google.com/thumbnail?id=x1&sz=w1200');
  assert.ok(!('id' in d.trabalhos[0]) && !('atualizadoPor' in d.trabalhos[0]), 'não expõe id nem e-mail de quem editou');
});
test('sem linha de promoção, promoção fica desativada', () => assert.strictEqual(C.toPromo([]).ativo, false));
test('dados iniciais passam na própria validação', () => {
  C.validatePrecos(C.SEED_PRECOS);
  C.validatePromo(C.SEED_PROMO);
});

console.log(`${passed} testes passaram${process.exitCode ? ' (há falhas)' : ''}`);
