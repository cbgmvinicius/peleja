# Peleja

Organizador acadêmico pessoal, feito como aplicação web estática/PWA.

## Estrutura do projeto

Os arquivos ativos do aplicativo ficam na raiz do projeto. Não devem existir cópias `pre-*`, `TEMP*` ou backups JSON junto do código.

- `index.html` — estrutura da interface.
- `styles.css` — estilos.
- `app.js` — regras principais do organizador.
- `sw.js` e `manifest.webmanifest` — PWA/offline.
- `assets/` — ícones e outros arquivos estáticos.

A versão de trabalho mais nova também possui módulos acadêmicos e de backend que serão trazidos ao repositório somente junto das correções de arquitetura e privacidade correspondentes; esta PR é apenas de saneamento.

## Higiene do repositório

- Backups manuais ficam fora do repositório.
- Arquivos temporários não são fonte de verdade.
- Segredos, senhas e chaves privadas nunca entram no Git.
- Use histórico do Git/Drive em vez de manter cópias `pre-*` ao lado do código.

## Validação mínima

Antes de publicar alterações JavaScript:

```bash
node --check app.js
node --check sw.js
```
