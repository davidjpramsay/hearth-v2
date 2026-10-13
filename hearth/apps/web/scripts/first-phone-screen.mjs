// Trusted local display only. Never mount, forward or serve this in Hearth's network UI.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { privateHearthOrigin, readPrivateSetupProof } from './private-first-phone.mjs';

const css = `
  :root { color-scheme: light; font-family: "Source Sans 3", system-ui, sans-serif;
    color: #27332e; background: #f7f5f0; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; }
  main { width: min(2880px, 73vw); padding-block: clamp(48px, 3.75vw, 144px); display: grid;
    grid-template-columns: 1.45fr 1fr; gap: 6vw; align-items: center; }
  .brand { display: flex; align-items: center; gap: clamp(16px, 1.25vw, 48px);
    margin-bottom: clamp(28px, 2.5vw, 96px);
    font-size: clamp(32px, 3.5vw, 136px); font-weight: 650; line-height: 1; }
  .brand img { width: auto; height: clamp(64px, 6.6vw, 256px); }
  h1 { margin: 0 0 clamp(24px, 2.08vw, 80px); font-size: clamp(48px, 5.75vw, 224px); line-height: 1;
    font-weight: 750; letter-spacing: -.015em; }
  .instructions { margin: 0; font-size: clamp(28px, 3.1vw, 120px); line-height: 1.32; }
  figure { margin: 0; text-align: center; }
  figure img { display: block; width: 100%; height: auto; aspect-ratio: 1;
    border-radius: clamp(16px, 1.04vw, 40px);
    background: white; image-rendering: pixelated; }
  figcaption { margin-top: clamp(16px, 1.25vw, 48px); font-size: clamp(24px, 1.85vw, 72px); line-height: 1.25; }
  [hidden] { display: none !important; }
  main:not(.ready) { display: block; max-width: 70vw; }
  @media (max-width: 760px) {
    main, main:not(.ready) { width: calc(100% - 48px); max-width: none; padding-block: 40px; grid-template-columns: 1fr;
      gap: 32px; text-align: center; }
    .brand { justify-content: center; margin-bottom: 28px; font-size: 36px; gap: 16px; }
    .brand img { height: 64px; }
    h1 { font-size: 48px; margin-bottom: 24px; }
    .instructions { font-size: 24px; }
    figure { width: min(100%, 360px); justify-self: center; }
    figcaption { font-size: 20px; margin-top: 16px; }
  }
  @media (max-height: 600px) and (min-width: 761px) {
    main { padding-block: 48px; width: calc(100% - 96px); gap: 48px; }
    .brand { margin-bottom: 24px; font-size: 36px; }
    .brand img { height: 64px; }
    h1 { font-size: 56px; margin-bottom: 24px; }
    .instructions { font-size: 28px; }
    figure { max-width: 330px; justify-self: end; }
    figcaption { font-size: 24px; margin-top: 16px; }
  }
`;

// No private proof is present in the document/script. A fresh local status gates the image GET.
const script = `
  const main = document.querySelector('main');
  const title = document.querySelector('h1');
  const instructions = document.querySelector('.instructions');
  const figure = document.querySelector('figure');
  const qr = figure.querySelector('img');
  let finished = false;
  let renderedState = null;
  function show(state) {
    if (state === renderedState) return;
    renderedState = state;
    const ready = state === 'ready';
    main.classList.toggle('ready', ready);
    figure.hidden = !ready;
    if (!ready) qr.removeAttribute('src');
    else if (!qr.hasAttribute('src')) qr.src = './qr';
    title.textContent = ready ? 'Welcome to Hearth' : state === 'complete'
      ? 'Hearth is ready' : 'Connecting to Hearth';
    instructions.textContent = ready ? 'Scan with your phone’s camera to set up your home.'
      : state === 'complete' ? 'Finish on your phone. Use Phones & screens to connect your TV.'
      : 'Waiting for your private Hearth server. The setup code stays hidden until it responds.';
    finished = state === 'complete';
  }
  qr.addEventListener('error', () => { if (!finished) show('unavailable'); });
  async function update() {
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 3000);
    try {
      const response = await fetch('./state', { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw new Error('Unavailable');
      const value = await response.json();
      show(['ready', 'complete'].includes(value.state) ? value.state : 'unavailable');
    } catch { show('unavailable'); }
    finally { clearTimeout(deadline); }
    if (!finished) setTimeout(update, 1000);
  }
  update();
`;

const hash = (value) => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;

async function readClaimState(origin, fetchStatus) {
  const response = await fetchStatus(`${origin}/api/v1/auth/status`, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok || !response.body) throw new Error('Status unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new Error('Status too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const status = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (
    status.mode !== 'private' ||
    status.configured !== true ||
    status.secureOrigin !== true ||
    status.accessMethod !== 'phone' ||
    status.authenticated !== false ||
    status.actor !== null ||
    typeof status.requiresSetup !== 'boolean'
  )
    throw new Error('Configured private phone access required');
  return status.requiresSetup ? 'ready' : 'complete';
}

export async function createFirstPhoneScreen({ keyFile, origin, fetchStatus = fetch }) {
  origin = privateHearthOrigin(origin);
  let state = await readClaimState(origin, fetchStatus);
  let verifiedAt = Date.now();
  let qr = null;
  if (state === 'ready') {
    const secret = await readPrivateSetupProof(keyFile);
    qr = await QRCode.toBuffer(`${origin}/#setup-phone=${secret}`, {
      type: 'png',
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'M',
    });
  }
  const mark = await sharp(
    await readFile(new URL('../public/brand/hearth-mark.png', import.meta.url)),
  )
    .trim()
    .png()
    .toBuffer();
  const font = await readFile(
    new URL(
      '../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2',
      import.meta.url,
    ),
  );
  const style = `@font-face { font-family: "Source Sans 3"; font-weight: 200 900; font-display: swap;
    src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2'); }\n${css}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer"><link rel="icon" href="data:,">
    <title>Hearth setup</title><style>${style}</style>
    </head><body><main><section aria-live="polite"><div class="brand">
    <img alt="" src="data:image/png;base64,${mark.toString('base64')}"><span>Hearth</span></div>
    <h1>Connecting to Hearth</h1><p class="instructions">Waiting for your private Hearth server.</p>
    </section><figure hidden><img alt="Private first-phone setup QR" width="1024" height="1024">
    <figcaption>Keep this setup code private.</figcaption></figure></main>
    <script>${script}</script></body></html>`;
  const prefix = `/${randomBytes(32).toString('base64url')}/`;
  let host;
  let stopped = false;
  let timer;
  const currentState = () =>
    state === 'complete'
      ? 'complete'
      : state === 'ready' && Date.now() - verifiedAt < 5000
        ? 'ready'
        : 'unavailable';
  async function refresh() {
    if (stopped || state === 'complete') return;
    try {
      const result = await readClaimState(origin, fetchStatus);
      if (stopped) return;
      state = result;
      verifiedAt = Date.now();
      if (state === 'complete') qr = null;
    } catch {
      if (!stopped) state = 'unavailable';
    }
    if (!stopped && state !== 'complete') timer = setTimeout(refresh, 2000);
  }
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; base-uri 'none';
      frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; font-src data:;
      connect-src 'self'; script-src ${hash(script)}; style-src ${hash(style)}`.replace(
        /\s+/g,
        ' ',
      ),
    );
    if (
      request.headers.host !== host ||
      (request.headers['sec-fetch-site'] !== undefined &&
        !['none', 'same-origin'].includes(request.headers['sec-fetch-site'])) ||
      (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    if (request.url === prefix) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } else if (request.url === `${prefix}state`) {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ state: currentState() }));
    } else if (request.url === `${prefix}qr` && currentState() === 'ready' && qr) {
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(qr);
    } else response.writeHead(404).end();
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 8;
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      accept();
    });
  });
  host = `127.0.0.1:${server.address().port}`;
  if (state !== 'complete') timer = setTimeout(refresh, 2000);
  return {
    // This local capability URL is for the trusted renderer only; do not log or forward it.
    url: `http://${host}${prefix}`,
    async close() {
      stopped = true;
      clearTimeout(timer);
      qr = null;
      server.closeAllConnections();
      await new Promise((accept) => server.close(accept));
    },
  };
}
