const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { version: appVersion } = require('../package.json');

const app = express();
const port = process.env.PORT || 80;
const publicDirectory = path.join(__dirname, '..', 'public');
const indexTemplate = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');

app.get('/', (_req, res) => {
  res.type('html').send(indexTemplate.replaceAll('__APP_VERSION__', appVersion));
});

app.use(express.static(publicDirectory));

app.listen(port, () => {
  console.log(`Frontend listening on port ${port} | version ${appVersion}`);
});
