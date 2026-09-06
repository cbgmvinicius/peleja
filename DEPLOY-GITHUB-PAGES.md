# Publicar o Study em uma URL permanente (GitHub Pages)

## Objetivo
Você fará isso uma vez. Depois, a URL será a "casa" do Study e os dados ficarão associados a ela no navegador.

## Passos
1. Crie um repositório no GitHub, por exemplo `study`.
2. Coloque **os arquivos desta pasta na raiz do repositório**.
3. No GitHub, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Escolha a branch principal (`main`) e a pasta `/ (root)`.
6. Salve e aguarde o GitHub publicar a URL.
7. Abra a URL publicada e faça a migração única do seu backup antigo.
8. A partir daí, use sempre essa URL.

## Atualizações futuras
Substitua os arquivos do repositório pelos da versão nova mantendo o mesmo repositório e a mesma URL.
O banco `study-core` do navegador não é substituído quando o código é atualizado.

## Observação de privacidade
O código do app pode ficar em um repositório público sem publicar seus dados pessoais: seus registros ficam no IndexedDB do seu navegador e não são enviados ao repositório.
