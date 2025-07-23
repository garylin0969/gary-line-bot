// 生成星級評分字符串
export function stars(n: number, seed?: string): string {
	let adjustedN = n;

	if (seed) {
		// 使用簡單的字符串哈希算法
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			const char = seed.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // 轉換為32位整數
		}

		// 基於哈希值生成-1到1的調整值
		const adjustment = (hash % 3) - 1; // -1, 0, 或 1
		adjustedN = Math.max(1, Math.min(5, n + adjustment));
	}

	return '★'.repeat(adjustedN) + '☆'.repeat(5 - adjustedN);
}

// 截取到第一個句號的內容
export function truncateToFirstPeriod(text: string): string {
	const periodIndex = text.indexOf('。');
	return periodIndex !== -1 ? text.substring(0, periodIndex + 1) : text;
}

// 調試日誌函數
export function logDebug(message: string, data?: any) {
	console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// 建立遊戲 URL
export function createGameUrl(groupId: string, action: 'get' | 'create' | 'roll', params: Record<string, string> = {}): URL {
	const url = new URL('http://localhost');
	url.searchParams.set('groupId', groupId);
	url.searchParams.set('action', action);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}
