export PATH := "./node_modules/.bin:" + env_var('PATH')

build:
  rm -rf lib
  bun run build.js
  tsc

test:
  bun test --timeout 20000

test-only file:
  bun test {{file}}

publish: build
  npx downdoc README.adoc
  npm publish

format:
  eslint --ext .ts --fix *.ts
  prettier --write *.ts

lint:
  eslint --ext .ts *.ts
  prettier --check *.ts
