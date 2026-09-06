STUDY V2.2 — FOUNDATION BUILD

NOME
- "Study" é provisório. A identidade visual pode ser renomeada depois sem mudar o banco.
- O banco interno se chama permanentemente `study-core` para não depender do nome do produto.

MUDANÇA MAIS IMPORTANTE
- Os dados deixaram de usar localStorage como armazenamento principal.
- Agora o app usa IndexedDB (`study-core`), com schema versionado.
- Materiais, provas, sessões, preferências e timer ativo ficam no banco local.
- O app pede Persistent Storage quando o navegador permite.
- Exportar/importar continua existindo apenas como BACKUP e para a migração inicial para uma nova origem.

ATUALIZAÇÕES SEM PERDER DADOS
Para isso funcionar de forma definitiva, use SEMPRE a mesma URL/origem.
Recomendado: publicar esta pasta em GitHub Pages e acessar sempre pela mesma URL HTTPS.
Depois disso, você pode substituir index.html, styles.css, app.js etc. quantas vezes quiser: o IndexedDB permanece ligado à URL, não à pasta do ZIP.

IMPORTANTE: PRIMEIRA MIGRAÇÃO
- Se V2.2 for aberta na MESMA origem do MedStudy antigo, o app tenta migrar automaticamente o localStorage antigo para IndexedDB.
- Se você estiver saindo de um `file://.../index.html` para uma nova URL HTTPS, o navegador não permite que a nova URL leia o armazenamento da antiga.
- Nesse caso haverá UMA última importação manual: exporte o JSON do MedStudy antigo e importe no Study hospedado.
- Depois dessa migração, atualizações normais não exigem mais exportar/importar.

OFFLINE / PWA
- O service worker foi atualizado para manter o app utilizável offline e buscar arquivos novos quando houver rede.
- Service worker e instalação como PWA exigem HTTPS ou localhost.

ARQUITETURA DE DADOS (V1)
Banco: study-core
IndexedDB version: 1
Data schema version: 1
Stores:
- materials
- exams
- sessions
- kv (settings, activeTimer e metadados)

O banco foi preparado para receber migrações futuras. Novos módulos (Clinical, Residency, Procedures, Integrations) devem evoluir o schema em vez de criar bancos separados.

BACKUP
- O backup agora é identificado como Study e inclui `database: study-core` e `schemaVersion`.
- O botão Exportar continua útil como cópia de segurança, mas não faz parte do fluxo normal de atualização.
