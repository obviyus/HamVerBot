const ORIGIN = "https://livetiming.formula1.com";

function proxiedUrl(request) {
	const url = new URL(request.url);
	if (url.pathname === "/") {
		return null;
	}

	if (
		!url.pathname.startsWith("/static/") &&
		url.pathname !== "/signalrcore" &&
		!url.pathname.startsWith("/signalrcore/")
	) {
		return null;
	}

	return new URL(`${url.pathname}${url.search}`, ORIGIN);
}

function proxyHeaders(request) {
	const headers = new Headers(request.headers);
	headers.set("Host", "livetiming.formula1.com");
	headers.set("Origin", "https://www.formula1.com");
	headers.set("Referer", "https://www.formula1.com/");
	headers.set(
		"User-Agent",
		headers.get("User-Agent") ||
			"Mozilla/5.0 (compatible; HamVerBot/1.0; +https://github.com/obviyus/HamVerBot)",
	);

	return headers;
}

function cacheHeaders(response) {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("X-HamVerBot-F1-Proxy", "1");
	return headers;
}

async function proxy(request, targetUrl) {
	const response = await fetch(targetUrl, {
		body: request.body,
		headers: proxyHeaders(request),
		method: request.method,
		redirect: "manual",
	});

	return new Response(response.body, {
		headers: cacheHeaders(response),
		status: response.status,
		statusText: response.statusText,
		webSocket: response.webSocket,
	});
}

export default {
	fetch(request) {
		const targetUrl = proxiedUrl(request);
		if (!targetUrl) {
			return new Response("OK - use /static/ or /signalrcore", {
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			});
		}

		return proxy(request, targetUrl);
	},
};
