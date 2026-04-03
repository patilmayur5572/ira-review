const esbuild = require('esbuild');
const production = process.argv.includes('--production');

async function main() {
  await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    treeShaking: true,
    alias: {
      // Node 18+ has native fetch — skip node-fetch and its 286KB unicode table (tr46)
      'node-fetch': './src/shims/native-fetch.js',
    },
  });
}

main().catch(() => process.exit(1));
