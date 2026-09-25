# TypeScript Pad — TypeScript

An open-source, offline playground for writing, running, and experimenting with
**TypeScript on Android**. An editor, console, and compiled JavaScript viewer
in a simple interface designed for on-screen keyboards on tablets.

No ads or account required. Built with Capacitor 8, CodeMirror 6, and
**TypeScript 6.0.3**, with the editor, compiler, and type libraries bundled in the APK.

## Features

- GitHub Dark-based theme and JetBrains Mono font.
- Run / Stop, Shift+Enter shortcut, and copy actions for TypeScript and compiled JavaScript.
- Collapsible Console/JavaScript panel that remembers its visibility setting.
- Type and syntax errors highlighted in the editor; tap an error to jump to its location.
- Console output for arrays, objects, Map, Set, bigint, errors, and circular references.
- Draft automatically saved on the device.
- Swipeable symbol toolbar above the Android keyboard, with Tab, Shift+Tab,
  and Run/Stop always accessible.

## Scope and limitations

One TypeScript file at a time, with strict mode enabled. Type errors prevent execution.
The console displays logs; it is not a command-line terminal. Node.js, npm packages,
import/export, the DOM, and file management are not supported.

Code runs in a disposable Web Worker, separate from the interface and without access
to the DOM or the Capacitor native bridge. This should not be treated as a secure
sandbox for hostile code. Promises, top-level await, timers, and Web Worker APIs
are supported. Each run is limited to 30 seconds, including asynchronous tasks.
Starting another run, pressing Stop, or moving the app to the background terminates
the previous worker. Up to 500 log entries are displayed per run.

Drafts use the WebView's local storage. Updates that keep the same app ID and signing
key preserve the draft; uninstalling the app or clearing its data deletes it.

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
- `src/runner.worker.ts`: code execution in a separate worker and console capture.
- `src/keyboard-toolbar.ts`: swipeable toolbar and native keyboard integration.
- `src/theme.ts`: editor colors.
- `android/`: Capacitor Android app and custom vector icons.

The compiler loads on the first run and accounts for most of the APK size.
Compilation happens on the device, without a remote service or CDN downloads.

## Verification

`npm test` covers compilation, offline standard libraries, type and syntax errors,
file scope, await, module restrictions, and log formatting. The interface should
also be checked in a browser and on a tablet, especially text selection, the
on-screen keyboard, swiping, and rotation.

At the initial release, `npm audit --omit=dev` reported no vulnerabilities.
The full audit reported transitive advisories in the Capacitor CLI's `uuid/xcode`
dependencies, which are iOS development tools and are not included in the Android APK.

## License

Open source under the [MIT License](LICENSE).
LiveCodes adaptations and the JetBrains Mono font license are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
