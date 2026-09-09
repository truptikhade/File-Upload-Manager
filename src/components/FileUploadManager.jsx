import React, { useCallback, useRef, useState } from 'react';
import { STATUS, formatBytes, useUploadQueue } from '../hooks/useUploadQueue';
import styles from './FileUploadManager.module.css';

function extensionTag(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '?' : name.slice(dot + 1, dot + 5).toUpperCase();
}

function StatusIcon({ status }) {
  if (status === STATUS.COMPLETED) {
    return (
      <svg className={styles.iconOk} viewBox="0 0 20 20" width="16" height="16">
        <path
          d="M4 10.5l3.5 3.5L16 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === STATUS.FAILED) {
    return (
      <svg className={styles.iconErr} viewBox="0 0 20 20" width="16" height="16">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

function FileRow({ item, onRetry, onCancel, onRemove }) {
  const isDone = item.status === STATUS.COMPLETED;
  const isFailed = item.status === STATUS.FAILED;
  const isCanceled = item.status === STATUS.CANCELED;
  const isPending = item.status === STATUS.PENDING;

  let subtitle;
  if (isFailed) subtitle = item.error || 'Upload failed';
  else if (isCanceled) subtitle = 'Canceled';
  else if (isPending) subtitle = 'Waiting\u2026';
  else if (isDone) subtitle = formatBytes(item.size);
  else subtitle = `${formatBytes(item.size)} \u00b7 ${item.progress}%`;

  return (
    <li className={styles.row} data-status={item.status}>
      <div className={styles.badge}>{extensionTag(item.name)}</div>

      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <span className={styles.name} title={item.name}>
            {item.name}
          </span>
          <span className={styles.rowActions}>
            {isFailed && (
              <button type="button" className={styles.linkBtn} onClick={() => onRetry(item.id)} aria-label={`Retry ${item.name}`}>
                Retry
              </button>
            )}
            {(item.status === STATUS.UPLOADING || isPending) && (
              <button type="button" className={styles.iconBtn} onClick={() => onCancel(item.id)} aria-label={`Cancel ${item.name}`}>
                &times;
              </button>
            )}
            {(isDone || isCanceled || isFailed) && (
              <button type="button" className={styles.iconBtn} onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
                &times;
              </button>
            )}
            <StatusIcon status={item.status} />
          </span>
        </div>

        <div className={styles.subtitle} data-tone={isFailed ? 'err' : isDone ? 'ok' : 'muted'}>
          {subtitle}
        </div>

        {item.status === STATUS.UPLOADING && (
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>
    </li>
  );
}

export default function FileUploadManager({ concurrency = 3 }) {
  const { items, addFiles, retryUpload, cancelUpload, removeItem, clearFinished } = useUploadQueue({ concurrency });
  const [collapsed, setCollapsed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(
    (fileList) => {
      if (fileList && fileList.length) addFiles(fileList);
    },
    [addFiles]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const activeCount = items.filter(
    (it) => it.status === STATUS.UPLOADING || it.status === STATUS.PENDING
  ).length;
  const allDone = items.length > 0 && activeCount === 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.dropzone} data-active={dragActive}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0} >
        <p>Drag files here, or click to browse</p>
        <input ref={inputRef} type="file" multiple hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span>{allDone ? `${items.length} item${items.length > 1 ? 's' : ''} done` : `Uploading ${activeCount} item${activeCount > 1 ? 's' : ''}`}</span>
            <span className={styles.headerActions}>
              <button type="button" className={styles.iconBtn} onClick={clearFinished} aria-label="Clear finished">
                Clear
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand' : 'Collapse'} >
                {collapsed ? '\u25B2' : '\u25BC'}
              </button>
            </span>
          </div>
          {!collapsed && (
            <ul className={styles.list}>
              {items.map((item) => (
                <FileRow key={item.id} item={item} onRetry={retryUpload} onCancel={cancelUpload} onRemove={removeItem}/>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
