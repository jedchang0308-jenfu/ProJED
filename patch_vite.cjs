const fs = require('fs');
let c = fs.readFileSync('vite.config.js', 'utf8');

c = c.replace(/manifest:\s*\{[\s\S]*?\}\s*,/g, 'manifest: false,');

fs.writeFileSync('vite.config.js', c, 'utf8');
console.log('vite.config.js patched: manifest removed.');
