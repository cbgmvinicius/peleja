# Cursos extras

CardioPapers ECG contém 128 títulos em 18 módulos. Os vídeos e os caminhos locais não são publicados. Mário Vergara é apenas um cartão “Em breve”.

O calendário segue os 17 módulos numerados (121 aulas), incluindo fins de semana. A aula `ecg-m06-01` está ancorada em 12/10/2026; datas anteriores e posteriores são calculadas em dias inteiros. As sete aulas de coronavírus são extras sem prazo. O painel destaca a aula de hoje, seguida das pendências antigas. Aulas anteriores não são marcadas automaticamente.

`courses-data.js` contém somente o catálogo público. Preserve os IDs existentes ao adicionar ou reordenar aulas: as marcações pessoais referenciam esses IDs. `courses.js` cuida das telas e escreve no armazenamento individual, que usa o mesmo controle de revisão e sincronização das demais informações privadas.

## Instalação em projetos existentes

Antes de publicar esta interface, execute `supabase-courses.sql` no projeto existente. A atualização substitui somente as funções de salvar/restaurar: não altera registros nem permissões. É repetível e preserva o campo `courses` quando um navegador ou backup antigo o omite. Instalações novas já recebem a mesma lógica em `supabase-upgrade.sql`.

Os backups novos incluem `courses`; uma lista vazia explícita restaura o progresso vazio. A importação de um backup antigo preserva os checks existentes. Nenhum check é publicado no catálogo acadêmico ou convertido em pontuação de ranking.

## Validação

`npm run check` e `npm test`: calendário, filtro, marcação/desmarcação, troca de conta, dois dispositivos simulados com PostgreSQL, isolamento, conflitos existentes, backups antigos/novos e pacote público. A prévia visual usa dados de teste; testes automatizados não substituem conferência no site publicado.
