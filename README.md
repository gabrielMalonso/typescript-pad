# TypeScript Pad

Playground pessoal para Android: um editor, um console e execução manual.
Projeto independente do LiveCodes, com Capacitor 8, CodeMirror 6 e **TypeScript 6.0.3**.
Sem anúncios, conta, servidor ou downloads em tempo de execução. O compilador,
bibliotecas de tipos e editor estão incluídos no APK e funcionam offline.

## O que tem

- GitHub Dark com as cores personalizadas de Gabriel.
- Run / Parar, atalho Shift+Enter, copiar TypeScript e JavaScript compilado.
- Painel Console/JavaScript recolhível pela seta à direita. Começa fechado e lembra
  a última escolha; Run não o abre automaticamente. Tocar em uma aba também o abre.
- Erros de tipo e sintaxe com indicação no editor; toque no erro para ir à posição.
- Logs de arrays, objetos, Map, Set, bigint, erros e valores circulares.
- Rascunho salvo automaticamente no dispositivo, inclusive quando o código está vazio.
- Barra acima do teclado Android, com Tab, Shift+Tab e Play/Parar fixos.
- Primeira página: `=`, `=>`, `<`, `>`, aspas duplas, crase, `:`, `;`.
- Segunda página: `!`, `&`, `|`, `{`, `}`, `[`, `]`.

As páginas se adaptam à largura disponível. Os parênteses ficam no teclado Samsung.

## Limites intencionais

Um único arquivo TypeScript, em modo strict. Erros de tipo impedem a execução.
O console é uma saída de logs, não um terminal de comandos. Não há Node.js,
pacotes npm, import/export, DOM ou gerenciador de arquivos.

O código roda em um Web Worker descartável, separado da interface e sem acesso
ao DOM ou à ponte nativa Capacitor. Isso não deve ser tratado como um ambiente
de segurança para código hostil. Há suporte a Promises, top-level await, timers
e APIs de Web Worker. Cada execução tem no máximo 30 segundos, incluindo tarefas
assíncronas; a próxima execução, Parar ou colocar o app em segundo plano encerra
o worker anterior. Até 500 logs são exibidos por execução.

O rascunho usa o armazenamento local da WebView. Atualizar mantendo o mesmo appId
e assinatura preserva os dados; desinstalar ou limpar os dados do app apaga o
rascunho. O LiveCodes instalado usa outro appId e permanece independente.

## Desenvolvimento

Node.js 22.12+ (usado: 24), JDK 21 e Android SDK 36.

```sh
npm ci
npm run dev
npm test
npm run build
```

Para compilar o APK neste Mac:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
ANDROID_HOME="$HOME/Library/Android/sdk" npm run android:build
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

```sh
adb devices -l
adb -s SERIAL install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s SERIAL shell am start -n com.gabrielalonso.typescriptpad/.MainActivity
```

## Estrutura

- `src/main.ts`: interface, rascunho, logs e ciclo de execução.
- `src/compiler.ts` / `compiler.worker.ts`: análise de tipos e compilação offline.
- `src/runner.worker.ts`: execução isolada da interface e captura do console.
- `src/keyboard-toolbar.ts`: barra paginável e integração com o IME nativo.
- `src/theme.ts`: cores do editor.
- `android/`: aplicativo Capacitor e ícones vetoriais próprios.

O compilador é carregado apenas na primeira execução. Ele é a maior parte do APK;
não é enviado ao computador ou baixado de uma CDN para executar o código.

## Verificação

`npm test` cobre compilação, bibliotecas padrão offline, erros de tipo e sintaxe,
escopo do arquivo, await, limites de módulos e representação dos logs. A interface
também deve ser verificada no navegador e no tablet, especialmente seleção de
texto, teclado Samsung, swipe e rotação.

O `npm audit --omit=dev` da versão inicial não apresenta vulnerabilidades.
O audit completo aponta avisos transitivos em `uuid/xcode` da CLI Capacitor,
ferramentas de desenvolvimento iOS que não entram no APK Android.

As adaptações reaproveitadas do LiveCodes estão documentadas em
`THIRD_PARTY_NOTICES.md`.
