# Publicar o Pad no site do curso

O Pad web não é publicado diretamente pelo Wrangler ou por uma conta Cloudflare. Ele é
empacotado neste repositório, instalado no leitor do curso e publicado pelo conector
**Sites**, preservando a URL e o acesso existentes.

## Projetos

- Pad: `/Volumes/SSD1TB/Projetos/typescript-pad`
- Site: `/Volumes/SSD1TB/Projetos/Typescript-Course/leitor`
- Projeto Sites: ler sempre `leitor/.openai/hosting.json` e reutilizar seu `project_id`

Não editar a cópia instalada em `node_modules`. Não incluir exercícios ou outras mudanças
locais do curso no commit ou no archive de publicação.

## 1. Atualizar o pacote no curso

Com as mudanças do Pad já testadas, commitadas e enviadas para `origin/main`:

```sh
cd /Volumes/SSD1TB/Projetos/typescript-pad
npm test
npm run build
npm pack --pack-destination ../Typescript-Course/leitor/vendor

cd /Volumes/SSD1TB/Projetos/Typescript-Course/leitor
npm install ./vendor/typescript-pad-0.2.0.tgz
npm test
npm run typecheck
npm run lint
npm run build
```

O `npm pack` deve ser executado no diretório do **Pad**. No repositório do curso, commitar
somente `leitor/vendor/typescript-pad-0.2.0.tgz` e `leitor/package-lock.json`, salvo se a
tarefa pedir outras mudanças. Enviar esse commit para `origin/main`.

## 2. Atualizar o back-end e publicar pelo Sites

A biblioteca usa a tabela `padFiles` e as funções `pad:files`, `pad:file` e
`pad:saveFile` no Convex do leitor. Publicar primeiro o schema e as funções pelo
procedimento do leitor (`npm run deploy:prepare`, após autorização de publicação),
e depois o Pad web/APK. As funções antigas de rascunho permanecem compatíveis.
Não executar `convex dev --once` apenas para checar tipos: esse comando publica
alterações no serviço. Para validação local, usar os testes e `tsc --noEmit -p convex`.


1. Ler `leitor/.openai/hosting.json` e consultar o projeto existente no Sites.
2. Confirmar a URL, a versão atual e o acesso. Preservar o acesso owner-only existente.
3. Solicitar ao Sites uma credencial curta para o repositório de origem. Nunca salvar nem
   exibir o token.
4. Buscar o `main` desse repositório e criar um commit de publicação que combine seu HEAD
   atual com o commit recém-enviado do curso. Se a árvore do curso estiver suja, usar Git
   plumbing (`merge-tree` e `commit-tree`) ou um worktree isolado; nunca levar mudanças não
   commitadas para a publicação.
5. Enviar esse commit ao `main` do repositório do Sites.
6. Criar um worktree temporário exatamente nesse commit, entrar em `leitor` e executar:

   ```sh
   npm ci
   npm run build
   tar -czf site.tar.gz dist
   ```

   O archive precisa conter `dist/.openai/hosting.json`, `dist/server` e `dist/client`.
7. Chamar `save_version_and_deploy_private` do Sites com o mesmo `project_id`, o SHA exato
   enviado ao repositório do Sites e o caminho absoluto do archive.
8. Aguardar `succeeded`, confirmar o novo número da versão e testar `/pad/` na URL existente.
9. Remover somente o worktree temporário, depois de validar seu caminho. Não apagar nem
   sobrescrever arquivos locais do usuário.

Um push no GitHub sozinho não atualiza o site. Também não usar `vinext deploy`,
`wrangler deploy` ou login manual no Cloudflare: o Cloudflare faz parte da infraestrutura do Sites,
mas a publicação deste projeto é gerenciada pelo conector Sites.
