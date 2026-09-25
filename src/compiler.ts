import ts from 'typescript';
import type { CodeIssue, CompileResult } from './protocol';

// The compiler and standard libraries ship inside the APK; there are no CDN requests.
const rawLibraries = import.meta.glob<string>('../node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const libraries = new Map(
  Object.entries(rawLibraries).map(([path, text]) => [path.split('/').pop()!, text]),
);
const libraryFiles = new Map<string, ts.SourceFile>();

const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  lib: ['lib.es2022.d.ts', 'lib.webworker.d.ts'],
  strict: true,
  noEmitOnError: true,
  skipLibCheck: true,
  types: [],
};

export const compile = (source: string): CompileResult => {
  // A trailing marker gives each draft its own scope without shifting user positions.
  const moduleSource = `${source}\nexport {};`;
  const file = ts.createSourceFile('main.ts', moduleSource, ts.ScriptTarget.ES2022, true);
  let javascript = '';
  const host: ts.CompilerHost = {
    getSourceFile: (path) => {
      if (path === 'main.ts') return file;
      const name = path.split('/').pop()!;
      const text = libraries.get(name);
      if (text === undefined) return undefined;
      let parsed = libraryFiles.get(name);
      if (!parsed) {
        parsed = ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true);
        libraryFiles.set(name, parsed);
      }
      return parsed;
    },
    getDefaultLibFileName: () => 'lib.es2022.d.ts',
    writeFile: (name, text) => {
      if (name.endsWith('.js')) javascript = text;
    },
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (path) => path === 'main.ts' || libraries.has(path.split('/').pop()!),
    readFile: (path) => (path === 'main.ts' ? moduleSource : libraries.get(path.split('/').pop()!)),
    getCanonicalFileName: (path) => path,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram(['main.ts'], options, host);
  const issues: CodeIssue[] = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const from = Math.min(diagnostic.start ?? 0, source.length);
      const location = diagnostic.file?.getLineAndCharacterOfPosition(from);
      return {
        from,
        to: Math.min(from + (diagnostic.length ?? 1), source.length),
        line: (location?.line ?? 0) + 1,
        column: (location?.character ?? 0) + 1,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      };
    });

  // This is a single-file scratchpad, not a module loader or a Node.js shell.
  const visit = (node: ts.Node) => {
    if (!ts.isSourceFile(node) && node.getStart(file) >= source.length) return;
    const isModuleSyntax =
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      node.kind === ts.SyntaxKind.ImportKeyword ||
      node.kind === ts.SyntaxKind.ExportKeyword;
    if (isModuleSyntax) {
      const from = node.getStart(file);
      const location = file.getLineAndCharacterOfPosition(from);
      issues.push({
        from,
        to: node.getEnd(),
        line: location.line + 1,
        column: location.character + 1,
        code: 0,
        message: 'Este playground executa um arquivo por vez, sem import/export ou pacotes npm.',
      });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (issues.length) return { ok: false, javascript: null, issues };
  // Treat the scratchpad as a module for type checking (no global-name collisions).
  // Its implicit `export {}` is unnecessary inside the isolated async runner.
  program.emit(undefined, undefined, undefined, undefined, {
    after: [
      (context) => (node) =>
        ts.isSourceFile(node)
          ? context.factory.updateSourceFile(
              node,
              node.statements.filter((statement) => !ts.isExportDeclaration(statement)),
            )
          : node,
    ],
  });
  return { ok: true, javascript, issues: [] };
};
