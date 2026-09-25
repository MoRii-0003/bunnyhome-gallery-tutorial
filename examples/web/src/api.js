async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

export const galleryApi = {
  list: () => request('/api/gallery'),
  rename: (id, title) => request(`/api/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  visionSettings: () => request('/api/settings/vision'),
  saveVisionSettings: (settings) => request('/api/settings/vision', {
    method: 'PATCH', body: JSON.stringify(settings),
  }),
};
