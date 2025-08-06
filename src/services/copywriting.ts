import * as OpenCC from 'opencc-js';
import { CONFIG } from '../config/constants.js';
import { CopywritingResponse, CachedCopywriting } from '../types/index.js';

// 檢查快取是否有效
const isCacheValid = (cachedAt: string): boolean => {
	const cachedTime = new Date(cachedAt);
	const now = new Date();
	const timeDiff = now.getTime() - cachedTime.getTime();
	return timeDiff < CONFIG.CACHE.COPYWRITING_EXPIRATION * 1000;
};

// 取得快取的文案資料
const getCached = async (kv: KVNamespace, cacheKey: string): Promise<CachedCopywriting | null> => {
	try {
		const cached = await kv.get(cacheKey);
		if (!cached) {
			return null;
		}

		const parsed = JSON.parse(cached) as CachedCopywriting;

		if (isCacheValid(parsed.cachedAt)) {
			return parsed;
		} else {
			return null;
		}
	} catch (error) {
		return null;
	}
};

// 快取文案資料
const cache = async (kv: KVNamespace, cacheKey: string, data: CopywritingResponse): Promise<void> => {
	const cachedData: CachedCopywriting = {
		data,
		cachedAt: new Date().toISOString(),
	};

	try {
		await kv.put(cacheKey, JSON.stringify(cachedData), {
			expirationTtl: CONFIG.CACHE.COPYWRITING_EXPIRATION,
		});
	} catch (error) {
		// 快取失敗時靜默處理
	}
};

// 取得文案資料
const fetchData = async (apiUrl: string): Promise<CopywritingResponse | null> => {
	try {
		const response = await fetch(apiUrl);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as CopywritingResponse;

		return data;
	} catch (error) {
		return null;
	}
};

// 取得隨機文案
const getRandomText = async (apiUrl: string, cacheKey: string, kv: KVNamespace): Promise<string | null> => {
	try {
		// 嘗試從快取獲取
		let cachedData = await getCached(kv, cacheKey);

		if (!cachedData) {
			// 快取未命中或過期，從API獲取新資料
			const freshData = await fetchData(apiUrl);

			if (!freshData || !freshData.copywritings || freshData.copywritings.length === 0) {
				return null;
			}

			// 快取新資料
			await cache(kv, cacheKey, freshData);
			cachedData = { data: freshData, cachedAt: new Date().toISOString() };
		}

		// 從文案陣列中隨機選擇一個
		const copywritings = cachedData.data.copywritings;
		if (copywritings.length === 0) {
			return null;
		}

		const randomIndex = Math.floor(Math.random() * copywritings.length);
		const selectedCopywriting = copywritings[randomIndex];

		return selectedCopywriting.content;
	} catch (error) {
		return null;
	}
};

// 預載所有文案資料
const preloadAll = async (kv: KVNamespace): Promise<void> => {
	const copywritingAPIs = [
		{ url: CONFIG.API.LOVE_COPYWRITING_TEXT, key: 'love_copywriting' },
		{ url: CONFIG.API.FUNNY_COPYWRITING_TEXT, key: 'funny_copywriting' },
		{ url: CONFIG.API.ROMANTIC_COPYWRITING_TEXT, key: 'romantic_copywriting' },
	];

	// 並行預載所有文案
	const preloadPromises = copywritingAPIs.map(async (api) => {
		try {
			const data = await fetchData(api.url);

			if (data && data.copywritings && data.copywritings.length > 0) {
				await cache(kv, api.key, data);
			}
		} catch (error) {
			// 預載失敗時靜默處理
		}
	});

	await Promise.all(preloadPromises);
};

// 匯出主要函數
export { fetchData as fetchCopywritingData };
export { getCached as getCachedCopywriting };
export { cache as cacheCopywriting };
export { getRandomText as getRandomCopywritingText };
export { preloadAll as preloadAllCopywritings };
