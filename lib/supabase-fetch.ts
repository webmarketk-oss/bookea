/** Les clés sb_publishable_ / sb_secret_ ne sont pas des JWT. */
export function isPublishableSupabaseKey(key: string) {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

/**
 * Le client Auth met la clé dans Authorization: Bearer.
 * Avec une clé publishable, Auth ne répond plus (erreur « {} »).
 * On laisse la clé dans apikey seulement.
 */
export function fetchForSupabaseKey(key: string): typeof fetch {
  if (!isPublishableSupabaseKey(key)) {
    return fetch;
  }

  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    return fetch(input, { ...init, headers });
  };
}
