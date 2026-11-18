# Painel de conteúdo (Apps Script)

O site lê preços, promoção e trabalhos de uma planilha Google. O painel `/admin` edita essa planilha depois de confirmar o login do Google, e só aceita e-mails da aba **Admins**.

Enquanto `config.js` estiver vazio, o site usa o conteúdo fixo do `index.html` e o painel mostra "não configurado".

## Configurar (uma vez, ~15 min)

1. **Cliente OAuth do Google**
   1. Acesse https://console.cloud.google.com/ e crie um projeto (ex.: "Super Hero Clean").
   2. Em **APIs e serviços → Tela de consentimento OAuth**, escolha **Externo**, preencha o nome do app e o e-mail, e não adicione escopos.
   3. Publique o app (**Publicar app → Em produção**). Com os escopos básicos de login, não é preciso verificação do Google.
   4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web**. Em **Origens JavaScript autorizadas**, adicione `https://hs-webstudio.github.io`.
   5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
2. **Apps Script**
   1. Acesse https://script.google.com e crie um projeto em branco.
   2. Cole o conteúdo de `Code.gs`.
   3. Em **Configurações do projeto**, marque "Mostrar appsscript.json" e cole o conteúdo de `appsscript.json`.
   4. Ainda em **Configurações do projeto → Propriedades do script**, adicione `CLIENT_ID` com o ID do passo 1.
   5. No editor, selecione a função `setup` e clique em **Executar**. Autorize o acesso pedido. Ela cria a planilha e a pasta de fotos, copia os preços e a promoção atuais do site e cadastra o seu e-mail como admin. Os links aparecem no registro de execução.
   6. Em **Implantar → Nova implantação → App da Web**: "Executar como: **Eu**", "Quem pode acessar: **Qualquer pessoa**". Copie a URL, que termina em `/exec`.
3. **Site**: preencha `config.js` com `api` (a URL `/exec`) e `clientId`, e publique.
4. **Dar acesso a alguém**: adicione o Gmail da pessoa numa linha nova da aba **Admins** da planilha. Para tirar o acesso, apague a linha.

## Atualizar o código do Apps Script

Depois de colar uma versão nova do `Code.gs`, vá em **Implantar → Gerenciar implantações → editar → Versão: Nova versão**. Assim a URL continua a mesma.

## Como funciona

- `GET /exec`: conteúdo público (preços, promoção e trabalhos visíveis), com cache de 10 minutos. O cache é limpo a cada alteração.
- `POST /exec`: ações do painel. Cada chamada envia o ID token do Google, que é conferido no Google (`tokeninfo`): app certo, emissor, validade, e-mail verificado e e-mail na aba Admins.
- As fotos ficam na pasta do Drive, visíveis só para quem tem o link. A pasta em si não é pública.
- O painel recorta as fotos em 3:2 (1200×800), aplica o mesmo ajuste leve de brilho e contraste e envia em JPEG.

## Testes

```
node tests/core.test.js
```
