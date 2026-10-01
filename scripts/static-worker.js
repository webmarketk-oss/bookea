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

    if (/^\/r\/[^/]+$/.test(pathname)) {
      const confirmationPage = await env.ASSETS.fetch(
        withPath(request, "/r/index.html"),
      );

      if (confirmationPage.status !== 404) {
        return confirmationPage;
      }
    }

    if (/^\/centres\/[^/]+$/.test(pathname)) {
      const centrePage = await env.ASSETS.fetch(
        withPath(request, "/centres/index.html"),
      );

      if (centrePage.status !== 404) {
        return centrePage;
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
