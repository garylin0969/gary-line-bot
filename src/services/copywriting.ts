import { CONFIG } from '../config/constants.js';
import { CopywritingResponse, CachedCopywriting } from '../types/index.js';
import { logDebug } from '../utils/common.js';

// 取得文案資料
export async function fetchCopywritingData(apiUrl: string): Promise<CopywritingResponse | null> {
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

// 取得快取的文案資料
export async function getCachedCopywriting(kv: KVNamespace, cacheKey: string): Promise<CachedCopywriting | null> {
	try {
		const cached = await kv.get(cacheKey);
		if (cached) {
			const parsed = JSON.parse(cached) as CachedCopywriting;

			// 檢查是否過期（2小時）
			const cachedAt = new Date(parsed.cachedAt);
			const now = new Date();
			const timeDiff = now.getTime() - cachedAt.getTime();

			if (timeDiff < CONFIG.CACHE.COPYWRITING_EXPIRATION * 1000) {
				logDebug('Cache hit for copywriting', { cacheKey });
				return parsed;
			} else {
				logDebug('Cache expired for copywriting', { cacheKey, timeDiff });
				return null;
			}
		}

		logDebug('Cache miss for copywriting', { cacheKey });
		return null;
	} catch (error) {
		logDebug('Error getting cached copywriting', { cacheKey, error });
		return null;
	}
}

// 快取文案資料
export async function cacheCopywriting(kv: KVNamespace, cacheKey: string, data: CopywritingResponse): Promise<void> {
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

// 取得隨機文案
export async function getRandomCopywritingText(apiUrl: string, cacheKey: string, kv: KVNamespace): Promise<string | null> {
	try {
		// 嘗試從快取獲取
		let cachedData = await getCachedCopywriting(kv, cacheKey);

		if (!cachedData) {
			// 快取未命中或過期，從API獲取新資料
			logDebug('Fetching fresh copywriting data', { apiUrl, cacheKey });
			const freshData = await fetchCopywritingData(apiUrl);

			if (!freshData || !freshData.copywritings || freshData.copywritings.length === 0) {
				logDebug('No copywriting data available', { apiUrl });
				return null;
			}

			// 快取新資料
			await cacheCopywriting(kv, cacheKey, freshData);
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

// 預載所有文案資料
export async function preloadAllCopywritings(kv: KVNamespace): Promise<void> {
	logDebug('Starting copywriting preload');

	const copywritingAPIs = [
		{ url: CONFIG.API.LOVE_COPYWRITING_TEXT, key: 'love_copywriting' },
		{ url: CONFIG.API.FUNNY_COPYWRITING_TEXT, key: 'funny_copywriting' },
		{ url: CONFIG.API.ROMANTIC_COPYWRITING_TEXT, key: 'romantic_copywriting' },
	];

	for (const api of copywritingAPIs) {
		try {
			logDebug(`Preloading copywriting: ${api.key}`);
			const data = await fetchCopywritingData(api.url);

			if (data && data.copywritings && data.copywritings.length > 0) {
				await cacheCopywriting(kv, api.key, data);
				logDebug(`Successfully cached copywriting: ${api.key}`, {
					totalCount: data.totalCount,
				});
			} else {
				logDebug(`No data available for copywriting: ${api.key}`);
			}
		} catch (error) {
			logDebug(`Error preloading copywriting: ${api.key}`, { error });
		}
	}

	logDebug('Completed copywriting preload');
}
