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

test('Wasm-backed resizable buffer rejects invalid sizes without corrupting state', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
      if (typeof memory.toResizableBuffer !== 'function') return null;

      const buffer = memory.toResizableBuffer();
      const before = buffer.byteLength;
      const errors = [];
      for (const size of [before - 65536, before + 1, before + 5 * 65536]) {
        try {
          buffer.resize(size);
          errors.push('no-error');
        } catch (error) {
          errors.push(error.name);
        }
      }

      const unchangedAfterFailures = buffer.byteLength === before && buffer === memory.buffer;
      buffer.resize(2 * 65536);
      return {
        errors,
        unchangedAfterFailures,
        resizedLength: buffer.byteLength,
        stillAssociated: buffer === memory.buffer
      };
    });

    if (result === null) return t.skip('WebAssembly.Memory.toResizableBuffer unavailable in this WebKit build');
    assert.deepEqual(result, {
      errors: ['RangeError', 'RangeError', 'RangeError'],
      unchangedAfterFailures: true,
      resizedLength: 2 * 65536,
      stillAssociated: true
    });
  });
});

test('Wasm-backed fixed-length buffer detaches when memory grows', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
      if (typeof memory.toResizableBuffer !== 'function' ||
          typeof memory.toFixedLengthBuffer !== 'function') return null;

      const resizable = memory.toResizableBuffer();
      const fixed = memory.toFixedLengthBuffer();
      const oldResizableDetached = resizable.byteLength === 0;
      const fixedIsCurrentBeforeGrowth = fixed === memory.buffer;
      const fixedLengthBeforeGrowth = fixed.byteLength;
      memory.grow(1);
      const currentBuffer = memory.buffer;
      return {
        oldResizableDetached,
        fixedIsCurrentBeforeGrowth,
        fixedLengthBeforeGrowth,
        fixedBufferDetachedAfterGrowth: fixed.byteLength === 0,
        currentBufferLengthAfterGrowth: currentBuffer.byteLength,
        fixedIsCurrentAfterGrowth: fixed === currentBuffer
      };
    });

    if (result === null) return t.skip('WebAssembly memory buffer conversion APIs unavailable');
    assert.deepEqual(result, {
      oldResizableDetached: true,
      fixedIsCurrentBeforeGrowth: true,
      fixedLengthBeforeGrowth: 65536,
      fixedBufferDetachedAfterGrowth: true,
      currentBufferLengthAfterGrowth: 131072,
      fixedIsCurrentAfterGrowth: false
    });
  });
});

test('Wasm-backed resizable buffer remains usable after dropping the Memory reference', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      let memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
      if (typeof memory.toResizableBuffer !== 'function') return null;

      const buffer = memory.toResizableBuffer();
      const view = new Uint8Array(buffer);
      view[123] = 0xa5;
      memory = null;

      // Allocation churn may exercise collection, but does not assume that GC ran.
      const churn = [];
      for (let i = 0; i < 24; i++) churn.push(new ArrayBuffer(64 * 1024));
      churn.length = 0;

      const beforeResize = {
        byteLength: buffer.byteLength,
        marker: new Uint8Array(buffer)[123]
      };
      buffer.resize(2 * 65536);
      return {
        beforeResize,
        afterResizeLength: buffer.byteLength,
        markerAfterResize: new Uint8Array(buffer)[123]
      };
    });

    if (result === null) return t.skip('WebAssembly.Memory.toResizableBuffer unavailable in this WebKit build');
    assert.deepEqual(result, {
      beforeResize: { byteLength: 65536, marker: 0xa5 },
      afterResizeLength: 2 * 65536,
      markerAfterResize: 0xa5
    });
  });
});
