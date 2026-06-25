#!/usr/bin/env node
/**
 * new-sop.mjs - scaffold a new SOP page and its mirrored image folder.
 *
 * Usage:
 *   node scripts/new-sop.mjs <doc-path> "<Title>" [options]
 *
 *   <doc-path>  Path to the new page, relative to the repo root, with or
 *               without the .mdx extension. The image folder mirrors it under
 *               /images (e.g. software/x/my-sop -> images/software/x/my-sop/).
 *
 * Options:
 *   --sidebar <text>   sidebarTitle (default: same as Title)
 *   --desc <text>      description frontmatter (default: empty)
 *   --force            Overwrite the page file if it already exists
 *   --dry-run          Print planned changes without writing anything
 *   --help             Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function placeholderPng(w, h, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

const HELP = `
Scaffold a new SOP page and its mirrored image folder.

  node scripts/new-sop.mjs <doc-path> "<Title>" [options]

  <doc-path>  Path to the new page, relative to the repo root, with or without
              the .mdx extension. The image folder mirrors it under /images.

Options:
  --sidebar <text>   sidebarTitle (default: same as Title)
  --desc <text>      description frontmatter
  --force            Overwrite the page file if it already exists
  --dry-run          Print planned changes without writing anything
  --help             Show this help
`;

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else positional.push(a);
  }
  return { positional, opts };
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function toPosix(p) {
  return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function pageTemplate({ title, sidebar, desc, imageBase }) {
  return `---
title: "${title}"
sidebarTitle: "${sidebar}"
description: "${desc}"
---

## Overview

Explain in one or two sentences what this SOP achieves and when it is run.

<Note>
  Useful context or an assumption the reader should know before starting.
</Note>

---

## Prerequisites

- Access to the relevant system
- A value confirmed in advance, for example the hub code \`de\`

---

## First section

<Steps>
  <Step title="Open the relevant page">
    Navigate to **Settings > Example** and click **Create**.

    ![Describe the screenshot here](${imageBase}/example-create.png)
  </Step>
  <Step title="Enter the details">
    Set the field to the following value:

    \`\`\`
    example-value
    \`\`\`

    | Field | Value |
    |--|--|
    | Name | \`Example Name\` |
    | Type | \`Example Type\` |
  </Step>
  <Step title="Save">
    Click **Save** to apply the changes.
  </Step>
</Steps>

<Warning>
  Call out anything that is easy to get wrong or has legal or financial impact.
</Warning>

---

## Related

See [another SOP](/software/example/another-sop) for the next step.
`;
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  if (opts.help || positional.length < 2) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 1);
  }

  const docPath = toPosix(positional[0]).replace(/\.mdx$/i, '');
  const title = positional[1];
  if (!docPath || /\s/.test(docPath)) {
    fail(`Doc path "${positional[0]}" must be a path with no spaces.`);
  }

  const sidebar = opts.sidebar || title;
  const desc = opts.desc || '';

  const segments = docPath.split('/');
  const pageFile = path.join(REPO_ROOT, ...segments) + '.mdx';
  const imageDir = path.join(REPO_ROOT, 'images', ...segments);
  const imageBase = '/' + ['images', ...segments].join('/');

  if (fs.existsSync(pageFile) && !opts.force) {
    fail(`Page already exists: ${docPath}.mdx (use --force to overwrite)`);
  }

  const page = pageTemplate({ title, sidebar, desc, imageBase });

  console.log(`\nSOP: ${title}`);
  console.log(`  page    ${docPath}.mdx`);
  console.log(`  images  ${imageBase}/`);

  if (opts.dryRun) {
    console.log('\n(dry run, nothing written)\n');
    return;
  }

  fs.mkdirSync(path.dirname(pageFile), { recursive: true });
  fs.writeFileSync(pageFile, page);
  fs.mkdirSync(imageDir, { recursive: true });
  fs.writeFileSync(path.join(imageDir, 'example-create.png'), placeholderPng(320, 180, [229, 231, 235]));

  console.log('\n✓ Scaffold created. Add this page to a "pages" array in docs.json:');
  console.log(`    "${docPath}"\n`);
}

main();
