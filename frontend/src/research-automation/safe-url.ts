// Source URLs come from third-party product data. Only plain https URLs (or same-origin API snapshots
// for images) are rendered; anything else falls back to a visible "no image" / "no link" state.

export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safeImageUrl(value: string | null | undefined): string | null {
  if (value?.startsWith('/api/') && !value.startsWith('//')) return value;
  return safeHttpsUrl(value);
}
