import { rm } from 'node:fs/promises';

// This directory contains generated server output only. Retired source stays in archive/.
const output = new URL('../dist/', import.meta.url);
if (!output.pathname.endsWith('/apps/server/dist/')) throw new Error('Unexpected build output.');
await rm(output, { recursive: true, force: true });
