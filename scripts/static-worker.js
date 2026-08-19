function withPath(request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  return new Request(url, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (isStaticAsset(pathname)) {
      return env.ASSETS.fetch(request);
    }

    const candidates =
      pathname === "/"
        ? ["/index.html"]
        : [`${pathname}.html`, `${pathname}/index.html`, pathname];

    for (const candidate of candidates) {
      const response = await env.ASSETS.fetch(withPath(request, candidate));

      if (response.status !== 404) {
        return response;
      }
    }

    return env.ASSETS.fetch(withPath(request, "/404.html"));
  },
};

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    /\.(?:css|js|mjs|map|svg|png|jpg|jpeg|webp|gif|ico|txt|json|woff|woff2|ttf|otf)$/i.test(
      pathname
    )
  );
}
