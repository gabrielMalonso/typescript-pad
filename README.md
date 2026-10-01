# TypeScript Pad — TypeScript

An open-source, offline playground for writing, running, and experimenting with
**TypeScript on Android**. An editor and console
in a simple interface designed for on-screen keyboards on tablets.

No ads or account required. Optional sign-in syncs your study library and draft with the course website.
Built with Capacitor 8, CodeMirror 6, and
**TypeScript 6.0.3**, with the editor, compiler, and type libraries bundled in the APK.

## Features

- GitHub Dark-based theme and JetBrains Mono font.
- Icon actions for formatting, copying, and running or stopping code.
- On-demand Prettier formatting that preserves the cursor and stays out of the way while typing.
- One collapsible sidebar on the right, with Console and Salvos tabs. The top-right button
  toggles it; visibility and the selected tab are remembered. Switching tabs preserves search
  and console output. On narrow screens, selecting a file reveals the editor again.
- Type and syntax errors highlighted automatically after a short pause in typing,
  without running the code. Hover or tap an underline to read the explanation and
  TypeScript error code; F8 moves to the next error and Ctrl/Cmd+Shift+M opens the list.
- Console output for arrays, objects, Map, Set, bigint, errors, and circular references.
- Saved studies with on-demand search, sorting, and a per-file menu to rename or delete.
  Deletion syncs across updated devices after confirmation; concurrent offline edits are kept as conflict copies.
- Typing in a new block automatically creates a study named “Sem título” plus a short ID. Every edit is saved
  on the device, with optional account sync; naming the file is optional. Empty new blocks
  do not create files. Switching studies preserves work and starts a separate undo history.
- Rename a study by clicking its name; Ctrl/Cmd+S saves or names the current code.
- Export one dated `.ts` file or all studies in a `.zip`, including files with duplicate
  names. Android uses the system document picker; the web build downloads the file.
- Swipeable toolbar above the Android keyboard: brackets and punctuation on the first
  page, indentation, formatting, Run/Stop, and operators on the second. Narrow screens
  split these groups into more pages to keep the touch targets comfortable.

## Scope and limitations

One TypeScript file at a time, with strict mode enabled. Type errors prevent execution.
The console displays logs; it is not a command-line terminal. Node.js, npm packages,
module imports/exports, the DOM, folders, and multi-file programs are not supported.

Code runs in a disposable Web Worker inside an opaque-origin sandboxed iframe,
without access to the application's storage, login session, DOM, network, or native bridge.
This is a personal playground, not a service for executing hostile programs.
Promises, top-level await, timers, and other Web Worker APIs
are supported. Each run is limited to 5 seconds, including asynchronous tasks.
Compilation has a separate 30-second timeout.
Starting another run, pressing Stop, or moving the app to the background terminates
the previous worker. Up to 500 log entries are displayed per run.

Drafts and the study library use the WebView's local storage. Updates that keep the same app ID and signing
key preserve the files; uninstalling the app or clearing its data deletes them.
Export studies to keep a separate copy. Signing in syncs all study files, including
names and dates, with the account. Local files created before sign-in are uploaded
without discarding them. Files already bound to another account are never uploaded
to the current one. Signing out retains the local copies.
Concurrent edits create a “(conflito)” copy, preserving both versions. Remote changes
never replace an editor buffer that could not be saved locally.

## Optional account and synchronization

The profile button connects the library and unnamed draft; it never gates the editor or compiler.
The web build at `/pad/` uses the course's WorkOS session. In Android, sign-in opens the
course in the system browser: compare the eight-character code, approve the device,
and return to the app. This uses the existing login without another OAuth application.
Only a hash of a random device credential appears in the URL or backend database.
The credential is encrypted with Android Keystore, excluded from backups, valid for
30 days, revocable at `/pad/dispositivos`, and restricted to Pad functions.

Local drafts, including the original `typescript-pad:source`, survive the update.
Edits persist locally immediately and sync after a short pause. Offline edits wait
for reconnection. Each named study has its own optimistic revision; conflicts retain
the remote version and create a local copy which also syncs to the account. The
subscription sends only IDs/versions, and downloads code only when a file changes.
The unnamed draft keeps the existing explicit conflict-resolution dialog and recovery
exports. Named studies do not replace that shared draft when opened or edited.
Deleted studies retain a small revision record with an empty source so offline devices cannot
restore the deleted ID. The updated backend must be deployed before distributing deletion support.

Cloud drafts and individual study files are limited to 200,000 characters; a file
above that limit stays local and does not prevent other files from syncing.
Signing out preserves the local code. Offline Android sign-out removes the local
credential; remote revocation can also be performed from the course.

Copy `.env.example` to `.env.local` to configure an Android build with the existing
public Convex and course URLs. With no configuration the editor still works locally.
The hosted course retains its private Sites access policy, independently of Pad sign-in.

The course installs a source tarball generated with `npm pack`, then calls
`buildWeb({ outDir, envDir })` from `build-web.mjs`. This compiles the same sources for
`/pad/` without requiring sibling repositories in production. TypeScript library paths
are resolved through Vite so both standalone and npm-hoisted installations work offline.
The complete update and Sites publication procedure is documented in [DEPLOY.md](DEPLOY.md).

## Development

Requires Node.js 22.12+ (recommended: 24), JDK 21, and Android SDK 36.

```sh
npm ci
npm run dev
npm test
npm run build
```

With `JAVA_HOME` pointing to JDK 21 and `ANDROID_HOME` to the Android SDK:

```sh
npm run android:build
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

Replace `SERIAL` with your device's serial number:

```sh
adb devices -l
adb -s SERIAL install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s SERIAL shell am start -n com.gabrielalonso.typescriptpad/.MainActivity
```

## Project structure

- `src/main.ts`: editor, draft sync, logs, and execution lifecycle.
- `src/study-library.ts` / `library-ui.ts`: durable study files and the responsive library.
- `src/library-sync.ts`: account sync, offline revisions, and conflict copies per study.
- `src/export-files.ts`: dated filenames, ZIP export, and Android document picker bridge.
- `src/compiler.ts` / `compiler.worker.ts`: type checking and offline compilation.
- `src/live-diagnostics.ts` / `diagnostics-client.ts`: live errors, touch explanations,
  and background checks that keep only the newest queued draft.
- `src/formatter.ts`: lazily loaded Prettier integration for on-demand TypeScript formatting.
- `src/runner.worker.ts`: code execution in a separate worker and console capture.
- `src/keyboard-toolbar.ts`: swipeable toolbar and native keyboard integration.
- `src/theme.ts`: editor colors.
- `android/`: Capacitor Android app and custom vector icons.

The compiler loads when the editor first checks a draft and accounts for most of the APK size.
Compilation happens on the device, without a remote service or CDN downloads.

## Verification

`npm test` covers compilation, formatting, offline standard libraries, type and syntax errors,
file scope, await, module restrictions, log formatting, file persistence and recovery,
search/sorting, and ZIP compatibility (against a reference archive created with Python's
standard `zipfile` implementation; Python is not needed to run the tests). The interface should
also be checked in a browser and on a tablet, especially text selection, the
on-screen keyboard, swiping, and rotation.

At the initial release, `npm audit --omit=dev` reported no vulnerabilities.
The full audit reported transitive advisories in the Capacitor CLI's `uuid/xcode`
dependencies, which are iOS development tools and are not included in the Android APK.

## License

Open source under the [MIT License](LICENSE).
LiveCodes adaptations, Prettier, and the JetBrains Mono font license are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
