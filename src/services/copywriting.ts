import { CONFIG } from '../config/constants.js';
import { CopywritingResponse, CachedCopywriting } from '../types/index.js';
import { logDebug } from '../utils/common.js';

// 文案快取管理器
class CopywritingCacheManager {
	// 檢查快取是否有效
	static isCacheValid(cachedAt: string): boolean {
		const cachedTime = new Date(cachedAt);
		const now = new Date();
		const timeDiff = now.getTime() - cachedTime.getTime();
		return timeDiff < CONFIG.CACHE.COPYWRITING_EXPIRATION * 1000;
	}

	// 取得快取的文案資料
	static async getCached(kv: KVNamespace, cacheKey: string): Promise<CachedCopywriting | null> {
		try {
			const cached = await kv.get(cacheKey);
			if (!cached) {
				logDebug('Cache miss for copywriting', { cacheKey });
				return null;
			}

			const parsed = JSON.parse(cached) as CachedCopywriting;

			if (this.isCacheValid(parsed.cachedAt)) {
				logDebug('Cache hit for copywriting', { cacheKey });
				return parsed;
			} else {
				logDebug('Cache expired for copywriting', { cacheKey });
				return null;
			}
		} catch (error) {
			logDebug('Error getting cached copywriting', { cacheKey, error });
			return null;
		}
	}

	// 快取文案資料
	static async cache(kv: KVNamespace, cacheKey: string, data: CopywritingResponse): Promise<void> {
		const cachedData: CachedCopywriting = {
			data,
			cachedAt: new Date().toISOString(),
		};

		try {
			await kv.put(cacheKey, JSON.stringify(cachedData), {
				expirationTtl: CONFIG.CACHE.COPYWRITING_EXPIRATION,
			});
			logDebug('Cached copywriting data', { cacheKey, totalCount: data.totalCount });
		} catch (error) {
			logDebug('Error caching copywriting data', { cacheKey, error });
		}
	}
}

// 文案API管理器
class CopywritingAPIManager {
	// 取得文案資料
	static async fetchData(apiUrl: string): Promise<CopywritingResponse | null> {
		try {
			logDebug(`Fetching copywriting data from: ${apiUrl}`);
			const response = await fetch(apiUrl);
			logDebug(`Copywriting API response status: ${response.status}`);

			if (!response.ok) {
				logDebug(`API request failed with status: ${response.status}`);
				return null;
			}

			const data = (await response.json()) as CopywritingResponse;
			logDebug(`Successfully fetched copywriting data`, {
				type: data.type,
				totalCount: data.totalCount,
				convertedToTraditional: data.convertedToTraditional,
			});

			return data;
		} catch (error) {
			logDebug(`Error fetching copywriting data:`, error);
			return null;
		}
	}

	// 取得隨機文案
	static async getRandomText(apiUrl: string, cacheKey: string, kv: KVNamespace): Promise<string | null> {
		try {
			// 嘗試從快取獲取
			let cachedData = await CopywritingCacheManager.getCached(kv, cacheKey);

			if (!cachedData) {
				// 快取未命中或過期，從API獲取新資料
				logDebug('Fetching fresh copywriting data', { apiUrl, cacheKey });
				const freshData = await this.fetchData(apiUrl);

				if (!freshData || !freshData.copywritings || freshData.copywritings.length === 0) {
					logDebug('No copywriting data available', { apiUrl });
					return null;
				}

				// 快取新資料
				await CopywritingCacheManager.cache(kv, cacheKey, freshData);
				cachedData = { data: freshData, cachedAt: new Date().toISOString() };
			}

			// 從文案陣列中隨機選擇一個
			const copywritings = cachedData.data.copywritings;
			if (copywritings.length === 0) {
				return null;
			}

			const randomIndex = Math.floor(Math.random() * copywritings.length);
			const selectedCopywriting = copywritings[randomIndex];

			logDebug('Selected random copywriting', {
				cacheKey,
				selectedId: selectedCopywriting.id,
				content: selectedCopywriting.content.substring(0, 20) + '...',
			});

			return selectedCopywriting.content;
		} catch (error) {
			logDebug('Error getting random copywriting text', { error, apiUrl, cacheKey });
			return null;
		}
	}
}

// 預載管理器
class PreloadManager {
	// 預載所有文案資料
	static async preloadAll(kv: KVNamespace): Promise<void> {
		logDebug('Starting copywriting preload');

		const copywritingAPIs = [
			{ url: CONFIG.API.LOVE_COPYWRITING_TEXT, key: 'love_copywriting' },
			{ url: CONFIG.API.FUNNY_COPYWRITING_TEXT, key: 'funny_copywriting' },
			{ url: CONFIG.API.ROMANTIC_COPYWRITING_TEXT, key: 'romantic_copywriting' },
		];

		// 並行預載所有文案
		const preloadPromises = copywritingAPIs.map(async (api) => {
			try {
				logDebug(`Preloading copywriting: ${api.key}`);
				const data = await CopywritingAPIManager.fetchData(api.url);

				if (data && data.copywritings && data.copywritings.length > 0) {
					await CopywritingCacheManager.cache(kv, api.key, data);
					logDebug(`Successfully cached copywriting: ${api.key}`, {
						totalCount: data.totalCount,
					});
				} else {
					logDebug(`No data available for copywriting: ${api.key}`);
				}
			} catch (error) {
				logDebug(`Error preloading copywriting: ${api.key}`, { error });
			}
		});

		await Promise.all(preloadPromises);
		logDebug('Completed copywriting preload');
	}
}

// 匯出主要函數
export async function fetchCopywritingData(apiUrl: string): Promise<CopywritingResponse | null> {
	return CopywritingAPIManager.fetchData(apiUrl);
}

export async function getCachedCopywriting(kv: KVNamespace, cacheKey: string): Promise<CachedCopywriting | null> {
	return CopywritingCacheManager.getCached(kv, cacheKey);
}

export async function cacheCopywriting(kv: KVNamespace, cacheKey: string, data: CopywritingResponse): Promise<void> {
	return CopywritingCacheManager.cache(kv, cacheKey, data);
}

export async function getRandomCopywritingText(apiUrl: string, cacheKey: string, kv: KVNamespace): Promise<string | null> {
	return CopywritingAPIManager.getRandomText(apiUrl, cacheKey, kv);
}

export async function preloadAllCopywritings(kv: KVNamespace): Promise<void> {
	return PreloadManager.preloadAll(kv);
}
