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

test('WebAssembly.Memory.grow detaches stale buffer and views', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Memory !== 'function') return null;
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
      const oldBuffer = memory.buffer;
      const oldView = new Uint8Array(oldBuffer);
      oldView[17] = 91;
      const previousPages = memory.grow(1);
      const newBuffer = memory.buffer;
      const newView = new Uint8Array(newBuffer);
      return {
        previousPages,
        oldBufferByteLength: oldBuffer.byteLength,
        oldViewLength: oldView.length,
        newBufferByteLength: newBuffer.byteLength,
        newViewLength: newView.length,
        newMemoryDataAt17: newView[17]
      };
    });
    if (result === null) return t.skip('WebAssembly.Memory unavailable');
    assert.deepEqual(result, {
      previousPages: 1,
      oldBufferByteLength: 0,
      oldViewLength: 0,
      newBufferByteLength: 131072,
      newViewLength: 131072,
      newMemoryDataAt17: 91
    });
  });
});

test('repeated WebAssembly memory growth preserves data and refreshes buffer', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Memory !== 'function') return null;
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
      const snapshots = [];
      for (let i = 0; i < 3; i++) {
        const previousBuffer = memory.buffer;
        new Uint8Array(previousBuffer)[100 + i] = 30 + i;
        const previousPages = memory.grow(1);
        snapshots.push({
          previousPages,
          staleBufferLength: previousBuffer.byteLength,
          currentLength: memory.buffer.byteLength,
          preservedByte: new Uint8Array(memory.buffer)[100 + i]
        });
      }
      return snapshots;
    });
    if (result === null) return t.skip('WebAssembly.Memory unavailable');
    assert.deepEqual(result, [
      { previousPages: 1, staleBufferLength: 0, currentLength: 131072, preservedByte: 30 },
      { previousPages: 2, staleBufferLength: 0, currentLength: 196608, preservedByte: 31 },
      { previousPages: 3, staleBufferLength: 0, currentLength: 262144, preservedByte: 32 }
    ]);
  });
});

test('failed WebAssembly memory growth leaves memory unchanged', async (t) => {
  await withWebKit(async (page) => {
    const result = await page.evaluate(() => {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Memory !== 'function') return null;
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
      new Uint8Array(memory.buffer)[0] = 77;
      let errorName = null;
      try { memory.grow(1); } catch (error) { errorName = error.name; }
      return {
        errorName,
        byteLength: memory.buffer.byteLength,
        firstByte: new Uint8Array(memory.buffer)[0]
      };
    });
    if (result === null) return t.skip('WebAssembly.Memory unavailable');
    assert.deepEqual(result, {
      errorName: 'RangeError',
      byteLength: 65536,
      firstByte: 77
    });
  });
});
