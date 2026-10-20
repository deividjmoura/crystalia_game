/* Crystalia — browser integration smoke for webapp + gameplay.
   CI uses real Chromium, a local authoritative Node/WebSocket server,
   and mobile touch emulation. Physical Android/iOS remain a separate
   acceptance gate; never claim these simulated tests prove real devices. */
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE_URL = process.env.CRYSTALIA_BASE_URL || 'http://127.0.0.1:2567/';

const show = async (page, selector) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return !!el && !el.closest('.screen.hidden') &&
      getComputedStyle(el).display !== 'none';
  }, selector, { timeout: 15000 });

function registerErrors(page, target) {
  page.on('pageerror', (err) => target.push(err.message));
}

async function getUi(page) {
  return page.evaluate(() => {
    const visible = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' &&
        el.getBoundingClientRect().width > 0;
    };
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      stick: visible('#stick'),
      dom: visible('#btnDom'),
      mode: document.querySelector('#hudMode')?.textContent,
      viewport: [innerWidth, innerHeight],
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      stickBox: box('#stick'),
      domBox: box('#btnDom'),
      perf: window.__CRYSTALIA_PERF__?.getSnapshot(),
      viewportMeta: document.querySelector('meta[name="viewport"]')?.content,
    };
  });
}

async function checkMobile(browser, width, height) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  registerErrors(page, errors);
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await show(page, '#landing');
    const m = await getUi(page);
    assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(m.viewportMeta), 'Landing must permit zoom for accessibility');

    await page.locator('#btnDemoQuick').tap();
    await show(page, '#game');
    await page.waitForTimeout(350);
    const ui = await getUi(page);
    assert.ok(ui.stick && ui.dom, 'Mobile joystick and Dom must be visible');
    assert.ok(ui.stickBox.width >= 80 && ui.domBox.width >= 44, 'Mobile touch targets must remain usable');
    assert.ok(ui.stickBox.x >= -1 && ui.stickBox.right <= width + 1, 'Joystick inside viewport');
    assert.ok(ui.domBox.x >= -1 && ui.domBox.right <= width + 1, 'Dom inside viewport');
    assert.ok(ui.scrollW <= width + 2, 'No horizontal scroll while playing');
    assert.ok(ui.scrollH <= height + 2, 'No page scrolling while playing');
    assert.equal(ui.perf?.mode, 'demo', 'Offline demo must be labeled demo');
    assert.ok(ui.perf?.samples >= 1, 'Game loop should render');

    // Touch action is not mouse click; it must actually invoke the Dom handler.
    const before = await page.locator('#hudEnTxt').innerText();
    await page.locator('#btnDom').tap();
    await page.waitForTimeout(150);
    const after = await page.locator('#hudEnTxt').innerText();
    assert.ok(Number.parseInt(after, 10) < Number.parseInt(before, 10), 'Dom touch must cost energy');

    await page.locator('#btnExit').tap();
    await show(page, '#menu');
    await page.keyboard.press('Escape');
    await show(page, '#landing');
    const timers = (await getUi(page)).perf?.activeTimers;
    assert.ok(!timers.input && !timers.reconnect && !timers.demo, 'No active gameplay timers after leaving');
    assert.deepEqual(errors, [], 'No uncaught JavaScript exceptions');
    return { viewport: width + 'x' + height, touch: true, demo: 'pass', dom: 'pass', exit: 'pass' };
  } finally {
    await context.close();
  }
}

async function checkDesktop(browser, width = 1366, height = 768) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  registerErrors(page, errors);
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#btnDemoQuick').click();
    await show(page, '#game');
    const ui = await getUi(page);
    assert.ok(!ui.stick && !ui.dom, 'Mouse/keyboard desktop should not have fake touch controls');
    await page.keyboard.press('Space');
    await page.waitForTimeout(130);
    assert.ok(Number.parseInt(await page.locator('#hudEnTxt').innerText(), 10) < 100, 'Desktop Space should fire Dom');
    assert.deepEqual(errors, []);
    return { viewport: width + 'x' + height, touch: false, demo: 'pass' };
  } finally {
    await context.close();
  }
}

async function checkMultiplayer(browser) {
  const errors = [];
  const a = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const b = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const pa = await a.newPage();
    const pb = await b.newPage();
    registerErrors(pa, errors);
    registerErrors(pb, errors);
    for (const [page, name] of [[pa, 'KaelQA'], [pb, 'LyraQA']]) {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('#btnGuest').click();
      await show(page, '#menu');
      await page.locator('#menuName').fill(name);
      await page.locator('#btnEnter').click();
      await show(page, '#game');
      await page.waitForFunction(() => window.__CRYSTALIA_PERF__?.getSnapshot().mode === 'live', { timeout: 20000 });
    }
    await pa.waitForFunction(() => window.__CRYSTALIA_PERF__?.getSnapshot().actors >= 2, { timeout: 10000 });
    await pb.waitForFunction(() => window.__CRYSTALIA_PERF__?.getSnapshot().actors >= 2, { timeout: 10000 });
    await pa.keyboard.down('d');
    await pa.waitForTimeout(280);
    await pa.keyboard.up('d');
    await pa.keyboard.press('Space');
    await pa.waitForFunction(() => Number.parseInt(document.querySelector('#hudEnTxt')?.textContent, 10) < 100, { timeout: 5000 });
    await pa.locator('#btnExit').click();
    await show(pa, '#menu');
    await pb.waitForFunction(() => window.__CRYSTALIA_PERF__?.getSnapshot().actors === 1, { timeout: 10000 });
    assert.deepEqual(errors, [], 'No JS exceptions in multiplayer');
    return { players: 2, synchronized: 'pass', dom: 'pass', exit: 'pass' };
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [
      await checkMobile(browser, 390, 844),
      await checkMobile(browser, 844, 390),
      await checkDesktop(browser, 1366, 768),
      await checkDesktop(browser, 800, 600),
      await checkMultiplayer(browser),
    ];
    for (const r of results) console.log('[BROWSER PASS]', JSON.stringify(r));
    console.log('Crystalia browser integration smoke: PASS');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error('[BROWSER FAIL]', err.stack || err); process.exitCode = 1; });
