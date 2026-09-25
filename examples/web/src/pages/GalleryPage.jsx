import { useState } from 'react';
import { galleryApi } from '../api.js';
import GalleryGrid from '../components/GalleryGrid.jsx';
import GalleryViewer from '../components/GalleryViewer.jsx';

export default function GalleryPage({ items, onRefresh, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const rename = async (item, title) => {
    setBusy(true);
    try {
      const updated = await galleryApi.rename(item.id, title.trim());
      setSelected(updated);
      await onChanged();
    } finally { setBusy(false); }
  };

  return <section className="gallery-page">
    <header className="page-heading">
      <div><p className="eyebrow">YOUR VISUAL MEMORY</p><h2>Gallery</h2></div>
      <button className="button-soft" onClick={onRefresh}>刷新</button>
    </header>
    <GalleryGrid items={items} onSelect={setSelected} />
    {selected && <GalleryViewer item={selected} onClose={() => setSelected(null)} onRename={rename} busy={busy} />}
  </section>;
}
