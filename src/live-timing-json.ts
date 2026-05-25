function cleanJson(text: string): unknown {
	return JSON.parse(text.trim().replace(/^\uFEFF/, ""));
}

export async function fetchLiveTimingJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	return cleanJson(await response.text()) as T;
}

export async function fetchOptionalLiveTimingJson<T>(url: string): Promise<T | undefined> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10000),
	});

	if (response.status === 404) {
		return undefined;
	}

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} for URL: ${url}`);
	}

	return cleanJson(await response.text()) as T;
}
