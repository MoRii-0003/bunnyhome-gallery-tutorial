import { useState } from 'react';
import { galleryApi } from '../api.js';
import GalleryGrid from '../components/GalleryGrid.jsx';
import GalleryViewer from '../components/GalleryViewer.jsx';

export default function GalleryPage({ items, onRefresh, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const rename = async (item, title) => {
    setBusy(true);
    try {
      const updated = await galleryApi.rename(item.id, title.trim());
      setSelected(updated);
      await onChanged();
    } finally { setBusy(false); }
  };

  const remove = async (item) => {
    if (!window.confirm('从 Gallery 删除这张图片及其记忆？原聊天附件不会受影响。')) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await galleryApi.remove(item.id);
      setSelected(null);
      await onChanged();
      if (result.imageCleanupFailed) setNotice('图库记录已删除，但图片文件清理未完成。');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  return <section className="gallery-page">
    <header className="page-heading">
      <div><p className="eyebrow">YOUR VISUAL MEMORY</p><h2>Gallery</h2></div>
      <button className="button-soft" onClick={onRefresh}>刷新</button>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    <GalleryGrid items={items} onSelect={setSelected} />
    {selected && <GalleryViewer item={selected} onClose={() => setSelected(null)} onRename={rename} onDelete={remove} busy={busy} />}
  </section>;
}
