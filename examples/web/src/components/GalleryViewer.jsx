import { useEffect, useState } from 'react';

function date(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(parsed);
}

export default function GalleryViewer({ item, onClose, onRename, onDelete, busy }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title || '');
  const [error, setError] = useState('');
  useEffect(() => { setTitle(item.title || ''); setEditing(false); setError(''); }, [item]);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try { await onRename(item, title); setEditing(false); }
    catch (failure) { setError(failure.message); }
  };

  return <div className="viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="viewer" role="dialog" aria-modal="true" aria-label="图片记忆">
      <button className="viewer-close" onClick={onClose} aria-label="关闭">×</button>
      <img className="viewer-image" src={item.image_url} alt={item.title || 'Gallery 图片'} />
      <div className="viewer-body">
        <div className="title-row">
          {editing
            ? <form className="rename-form" onSubmit={submit}>
                <input aria-label="图片标题" autoFocus maxLength="60" value={title} onChange={(event) => setTitle(event.target.value)} />
                <button disabled={busy || !title.trim()}>{busy ? '保存中…' : '保存'}</button>
                <button type="button" className="button-soft" onClick={() => setEditing(false)}>取消</button>
              </form>
            : <><h2>{item.title || '未命名图片'}</h2><button className="text-button" onClick={() => setEditing(true)}>改名</button></>}
        </div>
        {error && <p className="field-error">{error}</p>}
        <article className="memory-section">
          <small>中性的画面记忆</small><p>{item.first_description || '尚未记录'}</p>
        </article>
        <article className="memory-section impression">
          <small>观星当时留下的第一印象</small><p>{item.first_impression || '尚未记录'}</p>
        </article>
        <article className="memory-section context-note">
          <small>第一次出现时</small><p>{item.first_context_note || '当时没有保存文字上下文'}</p>
        </article>
        <footer className="viewer-meta">
          <span>见过 {item.seen_count} 次</span>
          {date(item.first_seen_at) && <span>首次 {date(item.first_seen_at)}</span>}
          {date(item.last_seen_at) && <span>最近 {date(item.last_seen_at)}</span>}
        </footer>
        <button className="delete-button" disabled={busy} onClick={() => onDelete(item)}>
          {busy ? '处理中…' : '删除这张图片'}
        </button>
      </div>
    </section>
  </div>;
}
