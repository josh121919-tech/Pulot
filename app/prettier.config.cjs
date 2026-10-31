// Ionic's shared style, plus the Angular parser for every template. Without it, files named
// *.page.html are parsed as plain HTML and the @if / @for blocks get flattened onto one line.
const ionic = require('@ionic/prettier-config');

module.exports = {
  ...ionic,
  overrides: [...ionic.overrides, { files: '*.html', options: { parser: 'angular' } }],
};
