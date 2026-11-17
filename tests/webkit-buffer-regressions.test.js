const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');

async function withWebKit(run) {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await run(page);
  } finally {
    await browser.close();
  }
}

test('runtime reports its WebKit user agent', async () => {
  await withWebKit(async (page) => {
    const ua = await page.evaluate(() => navigator.userAgent);
    assert.match(ua, /AppleWebKit/i);
  });
});

test('resizable ArrayBuffer length-tracking view follows shrink and growth', async (t) => {
  await withWebKit(async (page) => {
    const supported = await page.evaluate(() => {
      try { return new ArrayBuffer(8, { maxByteLength: 16 }).resizable === true; }
      catch { return false; }
    });
    if (!supported) return t.skip('Resizable ArrayBuffer is not supported by this WebKit build');

    const result = await page.evaluate(() => {
      const buffer = new ArrayBuffer(8, { maxByteLength: 16 });
      const view = new Uint8Array(buffer);
      buffer.resize(4);
      const afterShrink = { buffer: buffer.byteLength, view: view.length };
      buffer.resize(12);
      return { afterShrink, afterGrow: { buffer: buffer.byteLength, view: view.length } };
    });
    assert.deepEqual(result, {
      afterShrink: { buffer: 4, view: 4 },
      afterGrow: { buffer: 12, view: 12 }
    });
  });
});

test('fixed-length typed array becomes out-of-bounds then recovers after resize', async (t) => {
  await withWebKit(async (page) => {
    const supported = await page.evaluate(() => {
      try { return new ArrayBuffer(8, { maxByteLength: 16 }).resizable === true; }
      catch { return false; }
    });
    if (!supported) return t.skip('Resizable ArrayBuffer is not supported by this WebKit build');

    const result = await page.evaluate(() => {
      const buffer = new ArrayBuffer(8, { maxByteLength: 16 });
      const fixed = new Uint8Array(buffer, 4, 4);
      buffer.resize(2);
      const shrunk = { length: fixed.length, byteLength: fixed.byteLength };
      buffer.resize(8);
      return { shrunk, restored: { length: fixed.length, byteLength: fixed.byteLength } };
    });
    assert.deepEqual(result, {
      shrunk: { length: 0, byteLength: 0 },
      restored: { length: 4, byteLength: 4 }
    });
  });
});

test('DataView rejects access while its fixed range is out of bounds', async (t) => {
  await withWebKit(async (page) => {
    const supported = await page.evaluate(() => {
      try { return new ArrayBuffer(8, { maxByteLength: 16 }).resizable === true; }
      catch { return false; }
    });
    if (!supported) return t.skip('Resizable ArrayBuffer is not supported by this WebKit build');

    const result = await page.evaluate(() => {
      const buffer = new ArrayBuffer(8, { maxByteLength: 16 });
      const view = new DataView(buffer, 4, 4);
      buffer.resize(2);
      let throwsWhileOutOfBounds = false;
      try { view.getUint8(0); } catch (error) { throwsWhileOutOfBounds = error instanceof TypeError; }
      buffer.resize(8);
      return { throwsWhileOutOfBounds, restoredByteLength: view.byteLength, restoredRead: view.getUint8(0) };
    });
    assert.deepEqual(result, {
      throwsWhileOutOfBounds: true,
      restoredByteLength: 4,
      restoredRead: 0
    });
  });
});

test('structured-clone transfer detaches the original ArrayBuffer', async () => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const original = new ArrayBuffer(4);
      new Uint8Array(original)[0] = 42;
      const moved = structuredClone(original, { transfer: [original] });
      return {
        originalByteLength: original.byteLength,
        movedByteLength: moved.byteLength,
        movedFirstByte: new Uint8Array(moved)[0]
      };
    });
    assert.deepEqual(result, {
      originalByteLength: 0,
      movedByteLength: 4,
      movedFirstByte: 42
    });
  });
});
