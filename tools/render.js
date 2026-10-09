#!/usr/bin/env node
/**
 * render.js — 命令行出图（Node 侧）
 *   node tools/render.js --seed 7 --w 1000 --h 1333 --out out/seed7.png
 * 用与浏览器完全相同的核心（src/inkwash.js），因此"命令行出图 == 网页出图"。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { renderInk } = require('../src/inkwash.js');
const { encodePNG } = require('./png.js');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const seed = parseInt(arg('seed', '7'), 10);
const w = parseInt(arg('w', '1000'), 10);
const h = parseInt(arg('h', '1333'), 10);
const ink = parseFloat(arg('ink', '1.0'));
const out = arg('out', `out/seed${seed}.png`);

const t0 = Date.now();
const { data } = renderInk({ seed, w, h, ink });
const ms = Date.now() - t0;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePNG(data, w, h));
console.log(`${out}  ${w}x${h}  seed=${seed}  ${ms}ms  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
