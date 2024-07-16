const fs = require('node:fs')
const esbuild = require('esbuild')

let common = {
  bundle: true,
  sourcemap: 'external',
  entryPoints: ['index.ts'],
}

esbuild
  .build({
    ...common,
    outdir: 'lib/esm',
    format: 'esm',
    packages: 'external',
  })
  .then(() => console.log('esm build success.'))

esbuild
  .build({
    ...common,
    outdir: 'lib/cjs',
    format: 'cjs',
    packages: 'external',
  })
  .then(() => {
    const packageJson = JSON.stringify({ type: 'commonjs' })
    fs.writeFileSync(`${__dirname}/lib/cjs/package.json`, packageJson, 'utf8')

    console.log('cjs build success.')
  })

esbuild
  .build({
    ...common,
    outfile: 'lib/quill-asciidoc.bundle.js',
    format: 'iife',
    globalName: 'QuillAsciidoc',
    define: {
      window: 'self',
      global: 'self',
      process: '{"env": {}}',
    },
  })
  .then(() => console.log('standalone build success.'))
