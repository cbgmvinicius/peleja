# Peleja — contas, permissões, convites e ranking online

O frontend continua funcionando normalmente em modo local. No GitHub Pages, o Peleja fica **travado na tela de conta** até existir uma sessão autenticada e autorizada no Supabase.

## Ativação inicial

1. Crie um projeto no Supabase.
2. No SQL Editor, rode `supabase-schema.sql` inteiro.
3. Em **Project Settings → API**, copie o **Project URL** e a **Publishable key** (ou anon key, se o projeto ainda usar esse nome).
4. Preencha `supabase-config.js` com esses dois valores.
5. Em **Authentication → URL Configuration**, use a URL do GitHub Pages como `Site URL` e também como `Redirect URL`.
6. **Antes de criar a primeira conta**, autorize o seu próprio e-mail e marque-o como administrador:

```sql
insert into public.access_allowlist (email, desired_role, active)
values ('SEU_EMAIL_AQUI', 'admin', true)
on conflict (email) do update
set desired_role = 'admin', active = true, updated_at = now();
```

7. Crie a sua conta pelo próprio Peleja usando exatamente esse e-mail.
8. Publique os arquivos no GitHub Pages.

Se a sua conta já existir de testes anteriores, rode também:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = (
  select id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_AQUI')
);
```

## Barreira de acesso

O cadastro é **somente por convite**.

- O banco mantém uma allowlist de e-mails em `public.access_allowlist`.
- Um trigger em `auth.users` bloqueia a criação de qualquer conta cujo e-mail não esteja ativo nessa allowlist.
- Mesmo uma conta já existente perde acesso aos dados do Peleja se o e-mail for revogado, porque as policies de RLS consultam `has_peleja_access()`.
- No GitHub Pages, o frontend permanece bloqueado enquanto o usuário não estiver autenticado e autorizado.
- Isso protege os dados no Supabase. Como o GitHub Pages é hospedagem estática, os próprios arquivos HTML/CSS/JS continuam publicamente acessíveis pela URL do site/repositório; não guarde segredos neles.

Depois que a sua conta de administrador estiver funcionando, **não precisa mais usar SQL para convidar amigos**. Abra **Conta → Acesso da turma**, digite o e-mail e clique em **Autorizar**. Esse usuário passa a poder criar conta. Você também pode revogar/restaurar o acesso por ali.

## Dados locais por conta

No modo hospedado, apostilas, provas e simulados mantidos no navegador usam uma chave separada para cada `auth.uid()` do Supabase. Assim, trocar de conta no mesmo navegador não carrega nem sincroniza automaticamente o progresso local da conta anterior.

A versão antiga usava chaves locais sem usuário. Para não apagar dados durante a transição:

- somente o administrador recebe a opção de importar esses dados legados para a própria conta;
- a importação exige confirmação explícita;
- as chaves antigas não são apagadas automaticamente, para manter uma rota de recuperação;
- participantes nunca herdam silenciosamente o armazenamento legado.

Isso é isolamento lógico dentro do Peleja. Não substitui a segurança do perfil do navegador ou do sistema operacional contra alguém com acesso físico ao mesmo dispositivo e às ferramentas de desenvolvimento.

## Permissões

**Administrador**
- cria/edita/exclui apostilas e a estrutura acadêmica;
- cria/edita provas da faculdade;
- cria eventos de **Residência**;
- publica o gabarito oficial de cada questão;
- autoriza/revoga usuários;
- também pode enviar o próprio gabarito e votar na grande área das questões.

**Participantes**
- não criam nem alteram apostilas/estrutura;
- não criam eventos de Residência nem alteram o gabarito oficial;
- podem registrar o próprio resultado das provas da faculdade já cadastradas;
- em cada evento de Residência, enviam o próprio gabarito;
- podem sugerir a grande área de cada questão.

## Consenso de grande área

Cada usuário pode dar **um voto por questão**. A grande área com maior número de votos vira a **área aceita** da questão. Se houver empate no maior número de votos, a questão fica temporariamente **sem área aceita** até ocorrer desempate. O ranking por grande área usa sempre a área aceita atual.

## Ranking

- **Residência:** comparação total, por semestre, por ano ou por prova específica; todos esses recortes podem ser filtrados por grande área.
- **Faculdade:** comparação total, por semestre, por ano ou por prova específica; também permite recorte por grande área.
- **Apostilas:** comparação do histórico de questões das apostilas por grande área.

## Ranks clássicos

O rank é calculado pelo aproveitamento ponderado no recorte selecionado:

- **Bronze:** abaixo de 50%
- **Prata:** 50% a 59,9%
- **Ouro:** 60% a 64,9%
- **Cristal:** 65% a 69,9%
- **Mestre:** 70% a 74,9%
- **Campeão:** 75% a 79,9%
- **Titã:** 80% a 89,9%
- **Lendário:** 90% ou mais

Há rank por **prova/simulado**, **semestre**, **ano** e no total. Os badges exibem os escudos clássicos de liga do Clash of Clans a partir das imagens de referência do clash-wiki.com.

## Resultado rápido em Residência

Em um evento de Residência, o participante pode escolher entre preencher o gabarito questão a questão ou lançar apenas os **acertos totais** e os **acertos absolutos por grande área**. O denominador de cada grande área vem da classificação aceita pela votação da turma.

## Privacidade e segurança

Use somente a **publishable/anon key** no navegador. Nunca coloque a `service_role` no frontend.

As funções `SECURITY DEFINER` usadas apenas internamente por triggers e rotinas de recálculo têm execução direta revogada dos papéis `anon` e `authenticated`. O frontend acessa somente as operações previstas pelas policies de RLS e pelas funções públicas intencionais (`has_peleja_access()` e `is_peleja_admin()`).

Respostas individuais, caderno de erros, flashcards, observações e AnKing Notes não são publicados no ranking.

`academic-data.js` e `academic-data.json` ainda são arquivos estáticos do site. Portanto, a estrutura acadêmica contida neles é pública quando o repositório/site é público; mover essa estrutura para uma fonte protegida exige uma migração separada de arquitetura.
