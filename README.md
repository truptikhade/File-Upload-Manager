# File Upload Manager

A Google Drive style upload widget: a small dropzone plus a floating panel that tracks each file's name, size, progress, and status.

## Files

- `src/hooks/useUploadQueue.js` : all the logic, framework light and unit testable on its own: concurrency cap, chunked upload simulation, retry with resume, cancellation. The "network" call is injected (`transportChunk`) so tests don't depend on real timers or randomness.
- `src/components/FileUploadManager.jsx` : `.module.css` : the UI: dropzone, floating panel, perfile row with progress bar and status icon.
- `src/hooks/useUploadQueue.test.js` : Jest + React Testing Library tests covering async transitions, concurrency limits under load, resume from last chunk retry, and cancellation.

## Behavior

- **States**: `pending -> uploading -> completed`, or `failed` (with the option to retry), or `canceled`.
- **Concurrency**: at most 3 files upload at once; the rest wait as `pending` and are promoted automatically as slots free up.
- **Chunking**: each file is split into simulated chunks (`chunkSize`, default 256 KB) and "sent" one at a time with a randomized delay and failure chance, so progress moves chunk by chunk rather than jumping from 0 to 100.
- **Resume**: retrying a failed file continues from `uploadedChunks` rather than resending everything from the start.
- **Cancel**: uploading files stop midchunk; pending files are removed from the queue before they ever start.

## Seeing it in a browser

```bash
npm install
npm run dev
```

## Running the tests

```bash
npm install
npm test
```

## Using the component

`FileUploadManager.jsx` in the chat output is a selfcontained, Tailwind only variant of the same logic for quick preview the version here (with the CSS module) is the one meant for dropping into a real project.
