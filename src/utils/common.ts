// 評分系統工具
class RatingUtils {
	// 生成星級評分字符串
	static generateStars(n: number, seed?: string): string {
		let adjustedN = n;

		if (seed) {
			adjustedN = this.adjustRatingWithSeed(n, seed);
		}

		return '★'.repeat(adjustedN) + '☆'.repeat(5 - adjustedN);
	}

	// 基於種子調整評分
	private static adjustRatingWithSeed(n: number, seed: string): number {
		// 使用簡單的字符串哈希算法
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			const char = seed.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // 轉換為32位整數
		}

		// 基於哈希值生成-1到1的調整值
		const adjustment = (hash % 3) - 1; // -1, 0, 或 1
		return Math.max(1, Math.min(5, n + adjustment));
	}
}

// 文字處理工具
class TextUtils {
	// 截取到第一個句號的內容
	static truncateToFirstPeriod(text: string): string {
		const periodIndex = text.indexOf('。');
		return periodIndex !== -1 ? text.substring(0, periodIndex + 1) : text;
	}
}

// 日誌工具
class LogUtils {
	// 調試日誌函數
	static debug(message: string, data?: any): void {
		// console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
		return;
	}
}

// URL工具
class URLUtils {
	// 建立遊戲 URL
	static createGameUrl(groupId: string, action: 'get' | 'create' | 'roll', params: Record<string, string> = {}): URL {
		const url = new URL('http://localhost');
		url.searchParams.set('groupId', groupId);
		url.searchParams.set('action', action);

		Object.entries(params).forEach(([key, value]) => {
			url.searchParams.set(key, value);
		});

		return url;
	}
}

// 匯出主要函數
export function stars(n: number, seed?: string): string {
	return RatingUtils.generateStars(n, seed);
}

export function truncateToFirstPeriod(text: string): string {
	return TextUtils.truncateToFirstPeriod(text);
}

export function logDebug(message: string, data?: any): void {
	return LogUtils.debug(message, data);
}

export function createGameUrl(groupId: string, action: 'get' | 'create' | 'roll', params: Record<string, string> = {}): URL {
	return URLUtils.createGameUrl(groupId, action, params);
}
