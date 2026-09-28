# Peleja · versão 25

Organizador de apostilas, provas, simulados e comparação de resultados. Cinco perfis fixos: Vinícius (administrador), Wilton, Ulisses, Jonas e Tiago. Não há cadastro público, caderno de erros nem editor de flashcards.

## Uso

O modo local continua disponível abrindo `index.html` no computador. O histórico legado pertence a Vinícius. O modo publicado exige Supabase configurado e autenticação; não libera dados pessoais como visitante.

Para ativar o site, siga [SUPABASE_SETUP.md](SUPABASE_SETUP.md). A configuração pública aponta para o projeto Peleja no Supabase. A publicação pelo GitHub Actions é manual e bloqueia configuração ausente ou chave administrativa. Abrir por `file://` mantém o modo pessoal local mesmo com o backend configurado; para levar esse histórico ao site, exporte o backup local e importe conectado como Vinícius.

## Dados

- Cada conta usa um documento local separado pelo UUID e uma cópia privada em `user_workspace` no Supabase.
- Vinícius publica o catálogo comum de apostilas, provas e eventos. Leitura, produção, observações, vínculos pessoais com Anki e respostas permanecem separados.
- O grupo vê nomes, classificação das questões e agregados de desempenho. Respostas individuais e observações não são compartilhadas entre participantes. O administrador técnico do banco pode administrar os dados no Supabase.
- A migração guarda as chaves legadas e uma cópia de recuperação. Apenas o UUID de Vinícius, confirmado no servidor, recebe esse histórico. O primeiro participante a entrar não o herda.
- Edições concorrentes em dois aparelhos geram conflito explícito. Exporte antes de usar **Conta → Recarregar da nuvem**. Não há mesclagem automática silenciosa.
- O Drive serve como destino privado de backups exportados; não há backup automático agendado nem sincronização direta com a API do Drive.

## Resultados

Resultados detalhados são recalculados quando o gabarito ou as áreas mudam. Resultados rápidos ficam pendentes de revisão e saem do ranking até serem conferidos, pois acertos agregados não permitem reconstruir respostas por questão. A mudança de modalidade é transacional: falhas preservam a tentativa anterior.

O ranking mostra área, prova/período, quantidade de questões e aproveitamento ponderado. Os participantes podem ter feito conjuntos de provas diferentes; o filtro por prova permite comparação do mesmo evento. Não há filtro de intervalo livre de datas ou de todas as provas em comum.

## Desenvolvimento e testes

Requer Node.js 24.15 ou superior compatível e npm:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

Os testes usam DOM simulado e PostgreSQL embarcado (PGlite). Aplicam os dois arquivos SQL, verificam permissões reais do banco, conflitos, conversão de resultados, backup/restauração, exclusões, paginação acima de mil registros e fluxos dos formulários. Não substituem validação visual em Android/iPhone nem teste com o serviço Supabase real.

Arquivos principais: `app.js` (organizador), `storage.js` (propriedade/persistência local), `cloud.js` (contas e sincronização), `ui.js` (foco dos diálogos), `supabase-schema.sql` + `supabase-upgrade.sql` (banco). Os dois arquivos `academic-data` são somente a carga inicial e devem representar o mesmo catálogo; não sobrescrevem edições a cada abertura.

O cache `peleja-v25` guarda somente uma lista explícita de arquivos públicos. Não intercepta API, respostas autenticadas ou GETs arbitrários. As atualizações não apagam o armazenamento pessoal. A operação online ainda precisa de rede para autenticação e dados compartilhados.

## Publicação

`scripts/build-pages.mjs` prepara `dist/public` com uma lista explícita de arquivos da interface e um identificador de versão. SQL, scripts administrativos, testes e backups ficam fora do site. O código-fonte pode incluir SQL e testes; nunca inclua credenciais, senhas, exportações pessoais ou `node_modules` no GitHub.

`checks.yml` valida alterações. `pages.yml` publica somente quando executado manualmente após configuração e revisão. O repositório remoto antigo não é a fonte desta versão local e não foi atualizado automaticamente.
