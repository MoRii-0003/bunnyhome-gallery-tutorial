export default function GalleryGrid({ items, onSelect }) {
  if (!items.length) return <div className="empty-state">
    <span className="empty-mark">✳</span>
    <p>这里还没有图片</p>
    <small>当 Cyberboss 第一次看见一张图片，它会出现在这里。</small>
  </div>;

  return <div className="gallery-grid">
    {items.map((item) => <button key={item.id} className="tile" onClick={() => onSelect(item)}>
      <img src={item.image_url} alt={item.title || 'Gallery 图片'} loading="lazy" />
      <span>{item.title || '未命名图片'}</span>
    </button>)}
  </div>;
}
