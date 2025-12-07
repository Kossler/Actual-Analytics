const ANCHOR_ID = '__next_css__DO_NOT_USE__';

if (typeof document !== 'undefined') {
  const existing = document.querySelector(`#${ANCHOR_ID}`);
  if (!existing) {
    const anchor = document.createElement('noscript');
    anchor.id = ANCHOR_ID;

    const head = document.head || document.getElementsByTagName('head')[0];
    if (head) {
      head.appendChild(anchor);
    } else {
      // Fallback: if <head> is unavailable, append to documentElement.
      document.documentElement.appendChild(anchor);
    }
  }
}
