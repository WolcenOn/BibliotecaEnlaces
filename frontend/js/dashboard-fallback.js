(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const response = await nativeFetch(input, init);

    if (response.status !== 404 || !requestUrl.includes('/resource-dashboard')) {
      return response;
    }

    const fallbackUrl = requestUrl
      .replace('/resource-dashboard', '/resources')
      .replace(/\?.*$/, '');
    const fallbackResponse = await nativeFetch(fallbackUrl, init);
    if (!fallbackResponse.ok) return response;

    const resources = await fallbackResponse.json().catch(() => []);
    const compatible = Array.isArray(resources)
      ? resources.map(item => ({
          ...item,
          addedBy: item.addedBy || 'Miembro de la biblioteca',
          createdBy: item.createdBy || '',
          rating: Number(item.rating || 0),
          votes: Number(item.votes || 0),
          comments: Number(item.comments || 0),
          canEdit: Boolean(item.canEdit)
        }))
      : [];

    return new Response(JSON.stringify(compatible), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();
