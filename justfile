export PATH := "./node_modules/.bin:" + env_var('PATH')

dev:
  fd 'ts|html' | entr -r bash -c 'just build && python -m http.server 8080'

build:
  rm -rf lib
  bun run build.js
  tsc

publish: build
  npx downdoc README.adoc
  npm publish

format:
  eslint --ext .ts --fix *.ts
  prettier --write *.ts

lint:
  eslint --ext .ts *.ts
  prettier --check *.ts
