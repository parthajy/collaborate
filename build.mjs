// Build step — esbuild bundles both halves of the app into single files:
//   client → public/vendor/collab.js  (browser ESM: yjs + y-websocket + sync glue)
//   server → dist/server.cjs          (Node CJS: the whole backend, deps inlined)
//
// Bundling the server means the production image needs only `node` + dist/ + public/.
//
//   node build.mjs            build once
//   node build.mjs --watch    rebuild on change (dev)

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** Client: runs in the browser, loaded by room.html / landing.html. */
/** @type {import('esbuild').BuildOptions} */
const client = {
  entryPoints: ['src/client/index.ts'],
  outfile: 'public/vendor/collab.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: !watch,
  sourcemap: watch,
  logLevel: 'info',
};

/** Server: the Node process. CJS output so `__dirname`/`require` work natively. */
/** @type {import('esbuild').BuildOptions} */
const server = {
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node20'],
  // ws's optional native speed-ups — used if installed, harmlessly absent otherwise.
  external: ['bufferutil', 'utf-8-validate'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(client), esbuild.context(server)]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('esbuild: watching for changes…');
} else {
  await Promise.all([esbuild.build(client), esbuild.build(server)]);
  console.log('esbuild: build complete.');
}
