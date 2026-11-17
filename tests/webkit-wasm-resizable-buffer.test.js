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

test('Wasm-backed resizable buffer remains usable after fixed-length conversion', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
      if (typeof memory.toResizableBuffer !== 'function' ||
          typeof memory.toFixedLengthBuffer !== 'function') return null;

      const resizable = memory.toResizableBuffer();
      const fixed = memory.toFixedLengthBuffer();
      const oldBufferDetached = resizable.byteLength === 0;
      const fixedIsCurrent = fixed === memory.buffer;
      const byteLengthBeforeGrowth = fixed.byteLength;
      memory.grow(1);
      return {
        oldBufferDetached,
        fixedIsCurrent,
        byteLengthBeforeGrowth,
        byteLengthAfterGrowth: memory.buffer.byteLength,
        fixedLengthAfterGrowth: fixed.byteLength
      };
    });

    if (result === null) return t.skip('WebAssembly memory buffer conversion APIs unavailable');
    assert.deepEqual(result, {
      oldBufferDetached: true,
      fixedIsCurrent: true,
      byteLengthBeforeGrowth: 65536,
      byteLengthAfterGrowth: 131072,
      fixedLengthAfterGrowth: 65536
    });
  });
});
