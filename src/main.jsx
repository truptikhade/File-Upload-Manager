import React from 'react';
import ReactDOM from 'react-dom/client';
import FileUploadManager from './components/FileUploadManager';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ padding: 32, fontFamily: 'Roboto, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>My Drive</h1>
      <p style={{ color: '#5f6368', fontSize: 14, marginBottom: 20 }}>
        Drop files below to start an upload.
      </p>
      <FileUploadManager concurrency={3} />
    </div>
  </React.StrictMode>
);
