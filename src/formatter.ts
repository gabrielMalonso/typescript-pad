export async function formatTypeScript(source: string, cursorOffset: number) {
  const [prettier, typescriptPlugin, estreePlugin] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/estree'),
  ]);

  return prettier.formatWithCursor(source, {
    parser: 'typescript',
    plugins: [typescriptPlugin, estreePlugin],
    cursorOffset,
    tabWidth: 4,
  });
}
