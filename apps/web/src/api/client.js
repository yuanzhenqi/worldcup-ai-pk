const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";
export async function getPublicHealth() {
    const response = await fetch(`${apiBaseUrl}/api/public/health`);
    if (!response.ok) {
        throw new Error(`Public API health request failed with status ${response.status}`);
    }
    return (await response.json());
}
