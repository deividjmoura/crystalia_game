/*
 * Crystalia — intro em vídeo (substitui o splash padrão do Godot).
 *
 * Ordem/velocidade configuráveis aqui embaixo.
 * Fail-open: qualquer erro/vídeo ausente → overlay some e o jogo carrega normal.
 *
 * v1 — 2026-09-15 (arena-c4)
 */
(function () {
	'use strict';

	/** Ordem da sequência (relativo a web/). Troque a ordem aqui se quiser. */
	const PLAYLIST = [
		'videos/intro-1-generating.mp4',
		'videos/intro-2-loading.mp4',
	];
	/** "um pouco mais rápido" — pedido do humano 👑 */
	const RATE = 1.25;
	/** Trava de segurança: força saída mesmo se algo travar (ms). */
	const SAFETY_TIMEOUT_MS = 45000;

	const root = document.getElementById('crystalia-intro');
	if (!root) return;

	const video = document.getElementById('ci-video');
	const playBtn = document.getElementById('ci-play');
	const skipBtn = document.getElementById('ci-skip');
	const statusEl = document.getElementById('ci-status');
	const dots = Array.prototype.slice.call(
		document.querySelectorAll('#ci-dots i')
	);

	let index = 0;
	let finished = false;

	function setStatus(text) {
		if (statusEl) statusEl.textContent = text;
	}

	function markDot(i) {
		dots.forEach(function (d, k) {
			d.classList.toggle('on', k === i);
		});
	}

	function finish() {
		if (finished) return;
		finished = true;
		try {
			video.pause();
			video.removeAttribute('src');
			video.load();
		} catch (e) { /* noop */ }
		root.classList.add('ci-done');
		setTimeout(function () {
			root.remove();
		}, 700);
		window.dispatchEvent(new CustomEvent('crystalia:intro-done'));
	}

	function playCurrent() {
		markDot(index);
		setStatus('Crystalia — ' + (index + 1) + '/' + PLAYLIST.length);
		video.src = PLAYLIST[index];
		video.playbackRate = RATE;
		const p = video.play();
		if (p && p.catch) {
			p.catch(function (err) {
				// Autoplay com som bloqueado (1º vídeo, sem gesto): mostra o botão.
				if (index === 0 && err && err.name === 'NotAllowedError') {
					playBtn.classList.add('ci-visible');
					setStatus('toque para começar 🔊');
				} else {
					console.warn('[crystalia-intro] play falhou, pulando intro:', err);
					finish();
				}
			});
		}
	}

	video.addEventListener('ended', function () {
		index += 1;
		if (index < PLAYLIST.length) {
			playCurrent();
		} else {
			finish();
		}
	});

	video.addEventListener('error', function () {
		console.warn('[crystalia-intro] erro no vídeo, indo direto pro jogo.');
		finish();
	});

	playBtn.addEventListener('click', function () {
		playBtn.classList.remove('ci-visible');
		playCurrent(); // agora com gesto do usuário → som liberado
	});

	skipBtn.addEventListener('click', finish);

	document.addEventListener('keydown', function (ev) {
		if (ev.key === 'Escape') finish();
	});

	setTimeout(finish, SAFETY_TIMEOUT_MS);

	// Vai! Tenta autoplay direto (funciona se o browser já conhece o usuário).
	playCurrent();
})();
