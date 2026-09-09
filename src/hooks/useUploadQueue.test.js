import { act, renderHook, waitFor } from '@testing-library/react';
import { STATUS, computeChunkCount, formatBytes, useUploadQueue } from './useUploadQueue';


function makeFakeTransport({ failOn = [] } = {}) {
  const calls = [];
  const transport = jest.fn(({ item, chunkIndex }) => {
    calls.push(`${item.id}:${chunkIndex}`);
    const shouldFail = failOn.some(([id, idx]) => id === item.id && idx === chunkIndex);
    return shouldFail ? Promise.reject(new Error('simulated failure')) : Promise.resolve();
  });
  return { transport, calls };
}

function makeFile(name, size) {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

describe('formatBytes / computeChunkCount', () => {
  test('formats byte sizes with appropriate units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('computes at least one chunk even for tiny files', () => {
    expect(computeChunkCount(10, 1024)).toBe(1);
    expect(computeChunkCount(3000, 1024)).toBe(3);
  });
});

describe('useUploadQueue — async handling', () => {
  test('a file added to the queue transitions pending -> uploading -> completed', async () => {
    const { transport } = makeFakeTransport();
    const { result } = renderHook(() =>
      useUploadQueue({ concurrency: 3, chunkSize: 1024, transportChunk: transport })
    );

    act(() => {
      result.current.addFiles([makeFile('a.txt', 3000)]);
    });


    expect([STATUS.PENDING, STATUS.UPLOADING]).toContain(result.current.items[0].status);

    await waitFor(() => expect(result.current.items[0].status).toBe(STATUS.COMPLETED));
    expect(result.current.items[0].progress).toBe(100);
  });

  test('a chunk failure marks the file failed and preserves the completed-chunk count', async () => {
    const fileId = 'target';
    const { transport } = makeFakeTransport({ failOn: [[fileId, 2]] });
    const { result } = renderHook(() =>
      useUploadQueue({ concurrency: 3, chunkSize: 1024, transportChunk: transport })
    );

    let addedId;
    act(() => {
      [addedId] = result.current.addFiles([makeFile('b.txt', 5000)]); // 5 chunks
    });
  
    transport.mockImplementation(({ item, chunkIndex }) => {
      if (item.id === addedId && chunkIndex === 2) return Promise.reject(new Error('simulated failure'));
      return Promise.resolve();
    });

    await waitFor(() => {
      const it = result.current.items.find((i) => i.id === addedId);
      expect(it.status).toBe(STATUS.FAILED);
    });

    const failedItem = result.current.items.find((i) => i.id === addedId);
    expect(failedItem.uploadedChunks).toBe(2); // chunks 0 and 1 succeeded before chunk 2 failed
  });
});

describe('useUploadQueue — retry with resume', () => {
  test('retry continues from the last successful chunk instead of restarting', async () => {
    const seen = [];
    const transport = jest.fn(({ chunkIndex }) => {
      seen.push(chunkIndex);
      if (chunkIndex === 3) return Promise.reject(new Error('drop'));
      return Promise.resolve();
    });

    const { result: r2 } = renderHook(() =>
      useUploadQueue({ concurrency: 3, chunkSize: 1024, transportChunk: transport })
    );
    let id2;
    act(() => {
      [id2] = r2.current.addFiles([makeFile('c.txt', 5000)]); // 5 chunks
    });

    await waitFor(() => {
      expect(r2.current.items.find((i) => i.id === id2).status).toBe(STATUS.FAILED);
    });
    expect(r2.current.items.find((i) => i.id === id2).uploadedChunks).toBe(3);

    transport.mockImplementation(({ chunkIndex }) => {
      seen.push(chunkIndex);
      return Promise.resolve();
    });
    act(() => {
      r2.current.retryUpload(id2);
    });

    await waitFor(() => {
      expect(r2.current.items.find((i) => i.id === id2).status).toBe(STATUS.COMPLETED);
    });

    expect(seen.filter((c) => c === 0).length).toBe(1);
    expect(seen.filter((c) => c === 1).length).toBe(1);
    expect(seen.filter((c) => c === 2).length).toBe(1);
  });
});

describe('useUploadQueue — cancellation', () => {
  test('canceling a pending file marks it canceled without starting it', async () => {
    const { transport } = makeFakeTransport();
    const { result } = renderHook(() =>
      useUploadQueue({ concurrency: 1, chunkSize: 1024, transportChunk: transport })
    );

    let idA;
    let idB;
    act(() => {
      [idA] = result.current.addFiles([makeFile('busy.txt', 1024 * 20)]);
      [idB] = result.current.addFiles([makeFile('queued.txt', 1024)]);
    });

    
    expect(result.current.items.find((i) => i.id === idB).status).toBe(STATUS.PENDING);

    act(() => {
      result.current.cancelUpload(idB);
    });

    expect(result.current.items.find((i) => i.id === idB).status).toBe(STATUS.CANCELED);
    expect(result.current.items.find((i) => i.id === idA).status).not.toBe(STATUS.CANCELED);
  });
});

describe('useUploadQueue — concurrency / performance', () => {
  test('never runs more than `concurrency` uploads at once, even with many files queued', async () => {
    const concurrency = 3;
    let activeNow = 0;
    let maxObservedActive = 0;

    const transport = jest.fn(() => {
      activeNow += 1;
      maxObservedActive = Math.max(maxObservedActive, activeNow);
      return new Promise((resolve) => {
        setTimeout(() => {
          activeNow -= 1;
          resolve();
        }, 0);
      });
    });

    const { result } = renderHook(() =>
      useUploadQueue({ concurrency, chunkSize: 1024 * 1024, transportChunk: transport })
    );

    const files = Array.from({ length: 20 }, (_, i) => makeFile(`file-${i}.bin`, 1024));

    act(() => {
      result.current.addFiles(files);
    });

    await waitFor(
      () => {
        expect(
          result.current.items.every((it) => it.status === STATUS.COMPLETED)
        ).toBe(true);
      },
      { timeout: 5000 }
    );

    expect(maxObservedActive).toBeLessThanOrEqual(concurrency);
    expect(result.current.items).toHaveLength(20);
  });
});
