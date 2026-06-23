const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CSP — same shape as Railway's default but with 'wasm-unsafe-eval' added so
// MediaPipe (and any other WebAssembly-based library used by /demos/) can
// compile. blob: is added to a few directives because MediaPipe creates
// blob: URLs for workers and media streams.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https: *",
  "style-src 'self' 'unsafe-inline' https: *",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https: *",
  "script-src-elem 'self' 'unsafe-inline' https: *",
  "worker-src 'self' blob:",
  "font-src 'self' data: https: *",
  "connect-src 'self' blob: data: https: *",
  "media-src 'self' blob: https: *",
  "object-src 'none'",
  "frame-src 'self' https: *",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html',
}));

app.listen(PORT, () => {
  console.log(`bisesi.dev listening on ${PORT}`);
});
