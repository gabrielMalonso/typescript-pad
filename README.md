# TypeScript Pad — TypeScript

An open-source, offline playground for writing, running, and experimenting with
**TypeScript on Android**. An editor and console
in a simple interface designed for on-screen keyboards on tablets.

No ads or account required. Optional sign-in syncs one draft with the course website.
Built with Capacitor 8, CodeMirror 6, and
**TypeScript 6.0.3**, with the editor, compiler, and type libraries bundled in the APK.

## Features

- GitHub Dark-based theme and JetBrains Mono font.
- Icon actions for formatting, copying, and running or stopping code.
- On-demand Prettier formatting that preserves the cursor and stays out of the way while typing.
- Collapsible console on the right, with aligned editor and console headers. Open and close controls share the same top-right position; visibility is remembered.
- Type and syntax errors highlighted automatically after a short pause in typing,
  without running the code. Hover or tap an underline to read the explanation and
  TypeScript error code; F8 moves to the next error and Ctrl/Cmd+Shift+M opens the list.
- Console output for arrays, objects, Map, Set, bigint, errors, and circular references.
- Draft automatically saved on the device.
- Swipeable symbol toolbar above the Android keyboard, with Tab, Shift+Tab,
  formatting, and Run/Stop always accessible.

## Scope and limitations

One TypeScript file at a time, with strict mode enabled. Type errors prevent execution.
The console displays logs; it is not a command-line terminal. Node.js, npm packages,
import/export, the DOM, and file management are not supported.

Code runs in a disposable Web Worker inside an opaque-origin sandboxed iframe,
without access to the application's storage, login session, DOM, network, or native bridge.
This is a personal playground, not a service for executing hostile programs.
Promises, top-level await, timers, and other Web Worker APIs
are supported. Each run is limited to 30 seconds, including asynchronous tasks.
Starting another run, pressing Stop, or moving the app to the background terminates
the previous worker. Up to 500 log entries are displayed per run.

Drafts use the WebView's local storage. Updates that keep the same app ID and signing
key preserve the draft; uninstalling the app or clearing its data deletes it.

## Optional account and synchronization

The profile button connects a draft; it never gates the editor or compiler.
The web build at `/pad/` uses the course's WorkOS session. In Android, sign-in opens the
course in the system browser: compare the eight-character code, approve the device,
and return to the app. This uses the existing login without another OAuth application.
Only a hash of a random device credential appears in the URL or backend database.
The credential is encrypted with Android Keystore, excluded from backups, valid for
30 days, revocable at `/pad/dispositivos`, and restricted to Pad functions.

Local drafts, including the original `typescript-pad:source`, survive the update.
Edits persist locally immediately and sync after a short pause. Offline edits wait
for reconnection; different edits on two devices require a choice instead of a silent
overwrite. Both versions are kept locally before resolving a conflict; the profile
menu can export those recovery copies. Cloud drafts are limited to 200,000 characters.
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

- `src/main.ts`: interface, draft persistence, logs, and execution lifecycle.
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
file scope, await, module restrictions, and log formatting. The interface should
also be checked in a browser and on a tablet, especially text selection, the
on-screen keyboard, swiping, and rotation.

At the initial release, `npm audit --omit=dev` reported no vulnerabilities.
The full audit reported transitive advisories in the Capacitor CLI's `uuid/xcode`
dependencies, which are iOS development tools and are not included in the Android APK.

## License

Open source under the [MIT License](LICENSE).
LiveCodes adaptations, Prettier, and the JetBrains Mono font license are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
