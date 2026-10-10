const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const packaged = new Set(require('../package.json').build.files);

// A module missing from build.files makes the installed app fail on launch.
test('every local module required at startup is packaged', () => {
  const sources = ['main.js', 'stats.js', 'preload.js', 'logger.js', 'presentmon.js', 'nvidia-perf.js', 'network.js'];
  const missing = new Set();
  for (const file of sources) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/require\('\.\/([\w-]+)(?:\.js)?'\)/g)) {
      const required = `${match[1]}.js`;
      if (!packaged.has(required)) missing.add(required);
    }
    if (!packaged.has(file)) missing.add(file);
  }
  assert.deepEqual([...missing], []);
});
