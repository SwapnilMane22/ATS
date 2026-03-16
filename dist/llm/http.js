export async function postJson(url, body, headers = {}, timeoutMs = 60_000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...headers,
            },
            body: JSON.stringify(body),
            signal: ac.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} from ${url}: ${text}`);
        }
        return (await res.json());
    }
    finally {
        clearTimeout(t);
    }
}
//# sourceMappingURL=http.js.map