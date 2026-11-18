// Exports the web build and injects PWA tags into dist/index.html (single-output mode ignores +html.tsx).
const { execSync } = require('child_process');
const fs = require('fs');
execSync('npx expo export --platform web', { stdio: 'inherit' });
const p = 'dist/index.html';
let h = fs.readFileSync(p, 'utf8');
const tags = `
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#1F9D74" />
    <meta name="description" content="Split bills with friends. Everything stays on your phone." />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Splitty" />
    <link rel="manifest" href="/splitty/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/splitty/icon-180.png" />
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/splitty/sw.js',{scope:'/splitty/'}).catch(function(){})})}</script>
  `;
h = h.replace('</head>', tags + '</head>');
fs.writeFileSync(p, h);
console.log('PWA tags injected');
