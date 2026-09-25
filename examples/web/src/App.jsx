import { useEffect, useState } from 'react';
import { galleryApi } from './api.js';
import GalleryPage from './pages/GalleryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import './styles.css';

export default function App() {
  const [page, setPage] = useState('gallery');
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    try { setItems(await galleryApi.list()); setNotice(''); }
    catch (error) { setNotice(error.message); }
  };

  useEffect(() => { if (page === 'gallery') refresh(); }, [page]);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#gallery" onClick={() => setPage('gallery')}>
        <span className="eyebrow">CYBERBOSS · VISUAL MEMORY</span>
        <h1>看过一次，就不会忘</h1>
      </a>
      <nav aria-label="主导航">
        <button className={page === 'gallery' ? 'nav-active' : 'nav-button'} onClick={() => setPage('gallery')}>Gallery</button>
        <button className={page === 'settings' ? 'nav-active' : 'nav-button'} onClick={() => setPage('settings')}>设置</button>
      </nav>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {page === 'gallery'
      ? <GalleryPage items={items} onRefresh={refresh} onChanged={refresh} />
      : <SettingsPage />}
  </main>;
}
