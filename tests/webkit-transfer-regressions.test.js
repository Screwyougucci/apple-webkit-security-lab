const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webkit } = require('playwright');

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

test('failed duplicate transfer-list validation does not detach the buffer', async () => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const buffer = new ArrayBuffer(8);
      new Uint8Array(buffer)[0] = 0x5a;
      let errorName = null;
      try {
        structuredClone({ buffer }, { transfer: [buffer, buffer] });
      } catch (error) {
        errorName = error.name;
      }
      return {
        errorName,
        byteLength: buffer.byteLength,
        firstByte: new Uint8Array(buffer)[0]
      };
    });

    assert.deepEqual(result, {
      errorName: 'DataCloneError',
      byteLength: 8,
      firstByte: 0x5a
    });
  });
});

test('successful transfer detaches old views and preserves bytes in destination', async () => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const source = new ArrayBuffer(8);
      const sourceView = new Uint8Array(source);
      sourceView.set([11, 22, 33, 44]);
      const destination = structuredClone(source, { transfer: [source] });
      return {
        sourceLength: source.byteLength,
        sourceViewLength: sourceView.length,
        destinationLength: destination.byteLength,
        destinationBytes: Array.from(new Uint8Array(destination).slice(0, 4))
      };
    });

    assert.deepEqual(result, {
      sourceLength: 0,
      sourceViewLength: 0,
      destinationLength: 8,
      destinationBytes: [11, 22, 33, 44]
    });
  });
});

test('transferring a resizable ArrayBuffer preserves its resize capability', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      let source;
      try {
        source = new ArrayBuffer(8, { maxByteLength: 32 });
      } catch {
        return null;
      }
      if (source.resizable !== true) return null;

      const destination = structuredClone(source, { transfer: [source] });
      const beforeResize = {
        sourceLength: source.byteLength,
        destinationLength: destination.byteLength,
        resizable: destination.resizable,
        maxByteLength: destination.maxByteLength
      };
      destination.resize(16);
      return {
        beforeResize,
        afterResizeLength: destination.byteLength,
        afterResizeMaxByteLength: destination.maxByteLength
      };
    });

    if (result === null) return t.skip('Resizable ArrayBuffer transfer is unavailable in this WebKit build');
    assert.deepEqual(result, {
      beforeResize: {
        sourceLength: 0,
        destinationLength: 8,
        resizable: true,
        maxByteLength: 32
      },
      afterResizeLength: 16,
      afterResizeMaxByteLength: 32
    });
  });
});
