import { useCallback, useEffect, useRef, useState } from 'react';

export const STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
};

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${exp === 0 ? value : value.toFixed(1)} ${units[exp]}`;
}

export function computeChunkCount(size, chunkSize) {
  return Math.max(1, Math.ceil(size / chunkSize));
}

let idCounter = 0;
export function nextId() {
  idCounter += 1;
  return `f_${Date.now()}_${idCounter}`;
}

class UploadCanceled extends Error {
  constructor() {
    super('canceled');
    this.name = 'UploadCanceled';
  }
}

function defaultTransportChunk({ failureRate = 0.16, delayRange = [100, 260] } = {}) {
  return function transportChunk() {
    const ms = delayRange[0] + Math.random() * (delayRange[1] - delayRange[0]);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < failureRate) {
          reject(new Error('Network error \u2014 connection interrupted'));
        } else {
          resolve();
        }
      }, ms);
    });
  };
}

export function useUploadQueue({concurrency = 3,chunkSize = 256 * 1024,transportChunk,
  failureRate = 0.16,delayRange = [100, 260],} = {}) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  const cancelFlags = useRef(new Map());
  const inFlight = useRef(new Set());
  const transport = useRef(transportChunk || defaultTransportChunk({ failureRate, delayRange }));

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patchItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runUpload = useCallback(
    async (id, fromChunk = 0) => {
      inFlight.current.add(id);
      cancelFlags.current.set(id, false);
      const target = itemsRef.current.find((it) => it.id === id);
      if (!target) {
        inFlight.current.delete(id);
        return;
      }
      patchItem(id, { status: STATUS.UPLOADING, error: null });

      try {
        for (let chunk = fromChunk; chunk < target.totalChunks; chunk += 1) {
          if (cancelFlags.current.get(id)) throw new UploadCanceled();
         
          await transport.current({ item: target, chunkIndex: chunk });
          if (cancelFlags.current.get(id)) throw new UploadCanceled();
          const uploadedChunks = chunk + 1;
          patchItem(id, {
            uploadedChunks,
            progress: Math.round((uploadedChunks / target.totalChunks) * 100),
          });
        }
        patchItem(id, { status: STATUS.COMPLETED, progress: 100 });
      } catch (err) {
        if (err instanceof UploadCanceled) {
          patchItem(id, { status: STATUS.CANCELED });
        } else {
          patchItem(id, { status: STATUS.FAILED, error: err.message });
        }
      } finally {
        inFlight.current.delete(id);
        cancelFlags.current.delete(id);
      }
    },
    [patchItem]
  );


  useEffect(() => {
    const activeCount = inFlight.current.size;
    const openSlots = concurrency - activeCount;
    if (openSlots <= 0) return;

    const waiting = items.filter(
      (it) => it.status === STATUS.PENDING && !inFlight.current.has(it.id)
    );
    waiting.slice(0, openSlots).forEach((it) => {
      runUpload(it.id, 0);
    });
  }, [items, concurrency, runUpload]);

  const addFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList).map((file) => ({
        id: nextId(),
        file,
        name: file.name,
        size: file.size,
        status: STATUS.PENDING,
        progress: 0,
        uploadedChunks: 0,
        totalChunks: computeChunkCount(file.size, chunkSize),
        error: null,
      }));
      setItems((prev) => [...prev, ...incoming]);
      return incoming.map((it) => it.id);
    },
    [chunkSize]
  );

  const retryUpload = useCallback(
    (id) => { const target = itemsRef.current.find((it) => it.id === id);
      if (!target || inFlight.current.has(id)) return;

      runUpload(id, target.uploadedChunks || 0);
    },[runUpload]);

  const cancelUpload = useCallback((id) => {
    const target = itemsRef.current.find((it) => it.id === id);
    if (!target) return;
    if (target.status === STATUS.UPLOADING) {
      cancelFlags.current.set(id, true);
    } else if (target.status === STATUS.PENDING) {
      patchItem(id, { status: STATUS.CANCELED });
    }
  }, [patchItem]);

  const removeItem = useCallback(
    (id) => {
      cancelUpload(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    },[cancelUpload]);

  const clearFinished = useCallback(() => {
    setItems((prev) =>
      prev.filter((it) => it.status !== STATUS.COMPLETED && it.status !== STATUS.CANCELED)
    );
  }, []);

  return { items, addFiles, retryUpload, cancelUpload, removeItem, clearFinished };
}
