PELEJA — ORGANIZADOR DE ESTUDOS

COMO ABRIR
1. Extraia a pasta do arquivo ZIP.
2. Abra o arquivo index.html no navegador.
3. Para usar como site instalado e garantir o modo offline completo, publique a pasta em um serviço estático como GitHub Pages, Netlify ou Vercel.

RECURSOS
- Cadastro de apostilas por disciplina, data e ordem da aula.
- Status “Apostila produzida” com botão rápido direto no card, além do status de leitura concluída/pendente.
- Barra lateral com opção de expandir e colapsar.
- Associação de query do Anki Notes a cada apostila: o cartão mostra apenas a quantidade de NIDs/notas e oferece o botão “Copiar query”.
- Registro de questões por entradas datadas; cada sessão guarda total, acertos e erros.
- Os totais de questões por assunto, disciplina e no painel são calculados automaticamente a partir das entradas.
- Seção própria “Provas” na barra lateral.
- Cada prova pertence a uma disciplina, tem tipo e data e pode ser vinculada a várias apostilas já cadastradas na biblioteca.
- Filtro de situação da prova na biblioteca: “Em uso” (padrão), “Todas”, “Com prova pendente”, “Prova concluída” e “Sem prova”. “Em uso” esconde apenas apostilas cujas provas vinculadas já têm resultado completo lançado.
- Tipos disponíveis: PR1.1, PR1.2, PR2.1, PR2.2, PR1, PR2, Segunda chamada, Prova final e prova sem subdivisão.
- Segunda chamada e prova final são apenas opções; não são criadas nem tratadas como pendência automaticamente.
- Resultado da prova é opcional no cadastro inicial. Depois da avaliação, podem ser registrados total de questões, acertos e erros.
- Painel de provas com próximas avaliações, conteúdo vinculado e aproveitamento agregado.
- Painel de desempenho por assunto e resumo por disciplina para as questões de estudo.
- Backup e restauração em JSON incluindo apostilas, entradas de questões e provas.
- Layout responsivo para computador e celular.
- Ícones da barra lateral substituídos por versões mais refinadas em SVG.
- Ações secundárias de editar/excluir agrupadas em um menu de três pontinhos.
- Botões rápidos de questões, produção e leitura com ícones SVG mais refinados.
- Resumo de questões simplificado para exibir apenas: questões, acertos e erros.

MIGRAÇÃO
- Dados antigos de apostilas e entradas de questões continuam sendo lidos.
- Se a versão antiga possuía uma “data da prova” repetida nas apostilas, o Peleja tenta agrupá-la automaticamente em uma prova independente por disciplina e data.
- Registros antigos de questões de prova por apostila, quando presentes no backup, também são agrupados por disciplina, tipo e data.

ARMAZENAMENTO
- Apostilas e histórico de questões: localStorage do navegador.
- Provas: localStorage do navegador em armazenamento separado.
- Os dados não são enviados para nenhum servidor.
- Limpar os dados do site/navegador pode apagar as informações armazenadas; exporte backups periodicamente.

ATUALIZAÇÃO V4
- Texto de resultado de prova pendente centralizado corretamente.
- Tela de Desempenho simplificada: removidos Mapa de desempenho e Estatísticas por assunto; mantidos visão geral, diagnóstico rápido e Visão macro por disciplina.

- Lista de apostilas por prova com visual resumido e expansão opcional para evitar poluição visual.

- Botão de expandir/colapsar reposicionado como uma alça lateral na borda da sidebar, com visual mais discreto e natural.

ATUALIZAÇÃO V7
- Marca atualizada de MedStudy para Peleja.
- Ícone do app aplicado na barra lateral, favicon e manifesto PWA.
- Botão de expandir/colapsar recebeu fundo bege, integrado ao novo visual do app.

ATUALIZAÇÃO V8
- Marca textual ajustada para “peleja” em minúsculo, sem subtítulo.
- Botão de expandir/colapsar refinado para uma alça lateral menor, em bege e com visual mais discreto.

ATUALIZAÇÃO V9
- Alça de expandir/colapsar reposicionada para não disputar espaço com o ícone da marca.
- Fundo da alça trocado para um bege mais fechado, evitando branco e o verde da barra lateral.

ATUALIZAÇÃO V10
- Gráfico de acertos e erros centralizado dentro do painel.
- Paleta visual revisada para combinar com o ícone/logo, com verdes oliva, areia clara e laranja-terroso.

ATUALIZAÇÃO V11
- Círculo estatístico do hero corrigido, com contraste interno adequado.
- Cartões de destaque com nova cor mais sóbria e agradável.
- Alça da barra lateral convertida para formato circular.

ATUALIZAÇÃO V14
- Paleta suavizada para reduzir cansaço visual, mantendo a identidade do logo: verde oliva/sálvia, creme quente e terracota dessaturada.
- Fundos, bordas, sombras, estados de foco e cartões de destaque ficaram menos saturados e menos contrastados.
- Alça de expandir/colapsar corrigida para permanecer realmente circular mesmo com a regra genérica de botões.
- Alça elevada alguns pixels e reduzida para 30 px; o espaçamento do cabeçalho foi ajustado para ela ficar entre o ícone e o botão “Painel”, sem sobreposição.
- Cores do PWA (theme/background) alinhadas à nova paleta.

ATUALIZAÇÃO V15
- Na lista de apostilas de cada prova, a visualização resumida agora mostra até 3 chips.
- Quando houver mais de 3 apostilas, aparece apenas o botão “Ver todas (N)”.
- Removido o indicador extra “+X restantes”, para deixar o bloco mais limpo.

