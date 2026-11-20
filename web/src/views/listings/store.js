// Pasted posts live only in this browser (localStorage). Every read and write is wrapped: a private window or
// blocked storage just means the posts are gone after a reload, never a crash.
// A stored post: { id, n, text (contact details already removed), key, count, sample, edits: {}, pin: {lat, lon} | null,
//   to: the email the student typed for this post (optional; never read from the post) }
const KEY = 'quorum.listings.v1';

export function loadPosts() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v?.posts) ? v.posts.filter((p) => p && typeof p.text === 'string' && p.id) : [];
  } catch {
    return [];
  }
}

export function savePosts(posts) {
  try {
    if (posts.length) window.localStorage.setItem(KEY, JSON.stringify({ posts }));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage is off; the posts stay for this visit only */
  }
}

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
