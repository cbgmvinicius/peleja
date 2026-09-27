# Peleja

Organizador acadêmico pessoal, feito como aplicação web estática/PWA.

## Estrutura do projeto

Os arquivos ativos do aplicativo ficam na raiz do projeto. Não devem existir cópias `pre-*`, `TEMP*` ou backups JSON junto do código.

- `index.html` — estrutura da interface.
- `styles.css` — estilos.
- `app.js` — regras principais do organizador e estado local.
- `academic-data.js` / `academic-data.json` — estrutura acadêmica canônica distribuída com o frontend.
- `cloud.js` — autenticação, sincronização e ranking compartilhado.
- `supabase-schema.sql` — tabelas, funções, triggers e policies de RLS.
- `supabase-config.js` — configuração pública do cliente Supabase; nunca use `service_role` aqui.
- `SUPABASE_SETUP.md` — instalação e modelo de permissões do backend.
- `sw.js` e `manifest.webmanifest` — PWA/offline.
- `assets/` — ícones e outros arquivos estáticos.

## Armazenamento e contas

No uso local (`file://`), o Peleja mantém compatibilidade com as chaves antigas do navegador.

No modo hospedado, os dados pessoais mantidos no navegador são separados por usuário autenticado. Apostilas, provas e simulados usam chaves derivadas do `auth.uid()`; uma conta não passa a carregar o estado local da outra só porque as duas usaram o mesmo navegador.

Na primeira entrada do administrador após essa migração, o Peleja pode oferecer a importação dos dados legados sem usuário. Essa cópia exige confirmação e não apaga o armazenamento antigo automaticamente.

A estrutura de `academic-data.*` continua estática e, em um repositório/site público, também é pública. Dados que precisem ser privados devem viver atrás do backend/RLS, não apenas atrás de uma tela de login.

## Higiene do repositório

- Backups manuais ficam fora do repositório.
- Arquivos temporários não são fonte de verdade.
- Segredos, senhas e chaves privadas nunca entram no Git.
- Use histórico do Git/Drive em vez de manter cópias `pre-*` ao lado do código.

## Validação mínima

Antes de publicar alterações JavaScript:

```bash
node --check app.js
node --check cloud.js
node --check sw.js
node --check academic-data.js
```

Para alterações de autenticação/backend, revise também `supabase-schema.sql` e valide o fluxo em um projeto Supabase de teste antes de produção.
