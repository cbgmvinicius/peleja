# Ativação do Peleja online

## 1. Projeto

O projeto Peleja no plano gratuito está configurado em `https://vnncoohcmvvxgvvstnst.supabase.co`. Em 28/09/2026, os dois arquivos SQL foram aplicados e o cadastro público foi desativado. As cinco contas devem ser provisionadas com senhas escolhidas por Vinícius. As instruções abaixo também servem para reconstruir a instalação.

No SQL Editor, execute **nesta ordem**:

1. `supabase-schema.sql`.
2. `supabase-upgrade.sql`.

O segundo arquivo é transacional e pode ser repetido. Em uma instalação existente, faça backup antes de atualizar; ambos devem ser aplicados antes de liberar acesso. Executar só o primeiro reativa o modelo antigo de autorização. Para upgrades desta versão, reaplique o segundo. O adaptador antigo de agregados não é suficiente para restaurar um histórico detalhado inexistente; preserve e importe o backup local de Vinícius.

Em Authentication, desative **Allow new users to sign up** e **Allow anonymous sign-ins**. Mantenha o login por senha habilitado. Configure a URL do site quando o endereço do Pages estiver definido. Não habilite provedores sociais para os participantes. Veja [configuração oficial do Supabase Auth](https://supabase.com/docs/guides/auth/general-configuration).

## 2. Cinco contas fixas

Execute no PowerShell, dentro da pasta do projeto, substituindo apenas a URL pelo endereço do projeto:

```powershell
.\scripts\Configurar-Contas.ps1 -ProjectUrl 'https://SEU-PROJETO.supabase.co'
```

O script solicita a chave administrativa e as senhas em campos ocultos. Não passa essas credenciais na linha de comando, não as grava em arquivos e não as imprime. Use uma senha diferente para cada perfil, escolhida por Vinícius. Ele cria contas confirmadas e liga cada UUID ao nome autorizado. Se for repetido, preserva senhas existentes e não reativa contas desativadas.

| Usuário para entrar | Nome | Papel |
|---|---|---|
| vinicius | Vinícius | Administrador |
| wilton | Wilton | Participante |
| ulisses | Ulisses | Participante |
| jonas | Jonas | Participante |
| tiago | Tiago | Participante |

Supabase Auth usa internamente identificadores como `wilton@peleja.invalid`. Não são caixas de e-mail, não precisam existir e não são solicitados aos amigos. As contas são provisionadas pela API administrativa com confirmação prévia. O site apresenta somente usuário e senha. Não há cadastro ou alteração de senha na interface; isso não equivale a bloquear os endpoints nativos de alteração de credenciais do Supabase para um usuário já autenticado.

Para revogar acesso, altere `account_handles.active` para false no painel administrativo. Para trocar uma senha esquecida, use a API administrativa do Supabase, mantendo o UUID. Não exclua/recrie a conta: o histórico pertence a essa identidade. O script de provisionamento não troca senhas automaticamente.

## 3. Conectar a interface

Em `supabase-config.js`, preencha somente:

- `supabaseUrl`: URL HTTPS do projeto.
- `supabasePublishableKey`: chave pública publishable (ou anon legada).

**Nunca** cole `service_role`, chave secret ou senha nesse arquivo. URL/chave pública não concedem acesso aos dados sem autenticação e permissões do banco. A publicação rejeita chaves administrativas. O UUID de Vinícius chega do servidor por `account_handles`; `legacyOwnerUserId` pode permanecer vazio.

Entre primeiro como Vinícius para publicar o catálogo inicial. Depois confira um segundo perfil: apostilas/eventos comuns devem aparecer, mas os resultados e notas pessoais devem começar vazios. Não distribua as credenciais antes de aplicar os dois arquivos SQL e desativar o cadastro público.

## 4. Levar o histórico local

Abra a cópia local no mesmo navegador onde está o histórico. Use **Exportar dados** e salve fora do repositório. No site publicado, entre como Vinícius e use **Importar dados**. O navegador não compartilha o armazenamento de `file://` com HTTPS.

A migração automática é idempotente, guarda os dados legados e não sobrescreve uma conta de destino que já tenha dados. Sua execução real depende de abrir o aplicativo no navegador que contém o histórico; testes com dados fictícios não transferem o histórico real.

## 5. Backup e recuperação

Use **Exportar dados** regularmente e antes de importações ou mudanças de aparelho. Salve em uma pasta privada, por exemplo `C:\Google Drive\My Drive\College\Peleja Backups`, fora de `Peleja`. A sincronização desse arquivo pelo Drive é feita pelo aplicativo do Google Drive; não há rotina automática instalada pelo Peleja.

Quando conectado, o backup inclui dados locais e tentativas pessoais online (detalhadas ou rápidas). Se a nuvem estiver indisponível, o aplicativo avisa que exportou apenas os dados locais; preserve também o último backup completo. O JSON não contém senhas ou tokens de autenticação. Ele contém dados pessoais e não deve ir para o GitHub.

Para restaurar, entre na mesma conta e importe o arquivo. A restauração online é uma transação: se uma validação falhar, nada daquele backup é confirmado. Um resultado rápido cuja base de gabarito/áreas mudou exige revisão; a restauração pode ser recusada para não introduzir um ranking incorreto. Eventos removidos também podem impedir a restauração de suas tentativas. Guarde o arquivo para recuperação administrativa nesses casos.

Esses arquivos recuperam dados pessoais na mesma identidade; não substituem um backup integral de infraestrutura/Auth. Não apague o projeto Supabase contando apenas com a exportação do site. Para migração para outro projeto, será necessário mapear os UUIDs explicitamente.

Se houver conflito entre dois aparelhos, exporte os dados do aparelho com alterações ainda não enviadas. Use **Conta → Recarregar da nuvem** para adotar a versão remota. Uma cópia interna de recuperação é mantida, mas o backup exportado é a cópia independente do navegador. A importação de um backup substitui o estado pessoal e, para Vinícius, pode substituir também o catálogo compartilhado.

## 6. GitHub Pages

Revise a versão local antes de enviá-la ao repositório antigo. Nunca copie arquivos pessoais para o repositório. Após atualizar o código por uma branch revisada, em Settings → Pages selecione GitHub Actions. Execute **Publicar Peleja** manualmente. O fluxo testa e prepara somente os arquivos públicos de `dist/public`; SQL, scripts administrativos e exportações não são publicados. Veja [workflows oficiais do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Para conferir o pacote localmente, execute `node scripts/build-pages.mjs`. Ele recusa configuração vazia, chave administrativa e reutilização de uma pasta de saída já existente. O arquivo `release.json` do site identifica versão e commit.

Antes de distribuir o endereço, validar em Android e iPhone: login/sair, menu, formulário longo com teclado aberto, criação de evento pelo administrador, resultado pessoal por participante, segunda sessão sem histórico alheio, edição em dois aparelhos, conflito, backup/restauração e atualização do aplicativo. A validação visual e o teste no Supabase real permanecem pendentes nesta entrega.
