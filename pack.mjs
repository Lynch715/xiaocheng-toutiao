import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const here = new URL('./', import.meta.url);
const read = file => readFile(new URL(file, here), 'utf8');
const scripts = ['news.js', 'stories.js', 'editorial.js', 'followups.js', 'pressure.js', 'model.js', 'paper.js', 'game.js'];

let html = await read('index.html');
const css = await read('style.css');
const favicon = await readFile(new URL('favicon.ico', here));
const libraryFiles = runInNewContext(await read('stories.js') + '\nArray.from(LIBRARY_PHOTOS.values(), photo => photo.file)');
const assets = [
  ['millennium', '素材/千禧广场.webp'], ['scenes', '素材/临渡资料图.webp'], ['football', '素材/临渡足球场.webp'],
  ...libraryFiles.map(file => [file, file])
];
const imageUrls = Object.fromEntries(await Promise.all(assets.map(async ([key, file]) => {
  const mime = file.endsWith('.jpg') ? 'jpeg' : 'webp';
  const bytes = await readFile(new URL(file, here));
  return [key, `data:image/${mime};base64,${bytes.toString('base64')}`];
})));
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + css + '</style>');
html = html.replace('href="favicon.ico"', () => `href="data:image/x-icon;base64,${favicon.toString('base64')}"`);
html = html.replace(/<script id="assets">[^<]*<\/script>/, () =>
  '<script>const PAPER_ASSET_URLS = ' + JSON.stringify(imageUrls) + ';</script>');
for (const file of scripts) {
  const text = await read(file);
  html = html.replace('<script src="' + file + '"></script>', () => '<script>\n' + text + '</script>');
}
await mkdir(new URL('试玩版/', here), {recursive: true});
await writeFile(new URL('试玩版/小城头条.html', here), html);
