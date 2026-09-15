#!/usr/bin/env node
'use strict';

/*
 * inject_web_intro.js — injeta o overlay de intro em vídeo no index.html
 * exportado pelo Godot (web/index.html).
 *
 * POR QUÊ: o re-export do Godot sobrescreve web/index.html. Em vez de manter
 * um "custom HTML shell" frágil dentro do export preset, este script é
 * idempotente e re-aplicável após cada export:
 *
 *   node tools/inject_web_intro.js            # usa web/index.html
 *   node tools/inject_web_intro.js outro.html # caminho customizado
 *
 * Idempotente: se o marcador <!-- crystalia-intro --> já existir, sai sem
 * duplicar (exit 0).
 *
 * v1 — 2026-09-15 (arena-c4)
 */

const fs = require('fs');
const path = require('path');

const MARKER = '<!-- crystalia-intro:v1 -->';

const INTRO_HTML = `
${MARKER}
<link rel="stylesheet" href="intro/intro.css">
`;

const INTRO_BODY = `
		<div id="crystalia-intro" aria-label="Abertura de Crystalia">
			<video id="ci-video" playsinline preload="auto" disablepictureinpicture></video>
			<button id="ci-play" type="button" aria-label="Tocar abertura de Crystalia">🔥 <span>Entrar em Crystalia</span></button>
			<div id="ci-bottombar">
				<span id="ci-status">preparando Ignara…</span>
				<span id="ci-dots"><i class="on"></i><i></i></span>
				<button id="ci-skip" type="button">Pular intro ⏩</button>
			</div>
		</div>
		<script src="intro/intro.js" defer></script>
`;

function main() {
	const target =
		process.argv[2] || path.join(__dirname, '..', 'web', 'index.html');

	if (!fs.existsSync(target)) {
		console.error(`[inject_web_intro] arquivo não encontrado: ${target}`);
		process.exit(1);
	}
	let html = fs.readFileSync(target, 'utf8');

	if (html.includes('<!-- crystalia-intro')) {
		const m = html.match(/<!-- (crystalia-intro:v\d+) -->/);
		console.log(`[inject_web_intro] OK: já injetado (${m ? m[1] : '?'}) — nada a fazer.`);
		return;
	}

	if (!html.includes('</head>') || !html.includes('</body>')) {
		console.error('[inject_web_intro] HTML inesperado: sem </head> ou </body>. Abortando.');
		process.exit(1);
	}

	html = html.replace('</head>', `${INTRO_HTML}\t</head>`);
	html = html.replace('</body>', `${INTRO_BODY}\t</body>`);

	fs.writeFileSync(target, html);

	// Avisos não-fatais de ambiente
	const dir = path.dirname(target);
	for (const rel of ['intro/intro.css', 'intro/intro.js']) {
		if (!fs.existsSync(path.join(dir, rel))) {
			console.warn(`[inject_web_intro] ⚠ faltando ${rel} ao lado de ${path.basename(target)}`);
		}
	}
	const vids = fs.existsSync(path.join(dir, 'videos'))
		? fs.readdirSync(path.join(dir, 'videos')).filter((f) => f.endsWith('.mp4'))
		: [];
	console.log(`[inject_web_intro] ✅ intro injetado em ${target}`);
	console.log(`[inject_web_intro] vídeos encontrados em videos/: ${vids.length ? vids.join(', ') : '⚠ nenhum .mp4'}`);
}

main();
