import * as OpenCC from 'opencc-js';
import { CONFIG, zodiacMap } from '../config/constants.js';
import { HoroscopeData, HoroscopeResponse, CachedHoroscope } from '../types/index.js';
import { logDebug, truncateToFirstPeriod } from '../utils/common.js';
import { DateUtils } from '../utils/date.js';

// OpenCC 轉換器
let converter: Promise<(text: string) => Promise<string>> | null = null;

async function getConverter(): Promise<(text: string) => Promise<string>> {
	if (!converter) {
		converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
	}
	return converter;
}

// 取得所有占星資料
export async function fetchAllHoroscopesData(): Promise<HoroscopeResponse | null> {
	try {
		logDebug('Fetching all horoscope data', { apiUrl: CONFIG.API.HOROSCOPE });
		const response = await fetch(CONFIG.API.HOROSCOPE);
		logDebug('Horoscope API response status', { status: response.status });

		if (!response.ok) {
			logDebug('Failed to fetch horoscope data', { status: response.status });
			return null;
		}

		const horoscopeData = (await response.json()) as HoroscopeResponse;
		logDebug('Successfully fetched all horoscope data', {
			successCount: horoscopeData.successCount,
			totalConstellations: horoscopeData.totalConstellations,
		});
		return horoscopeData;
	} catch (error) {
		logDebug('Error fetching all horoscope data', { error });
		return null;
	}
}

// 取得特定星座占星資料
export async function fetchHoroscopeData(zodiacEn: string): Promise<HoroscopeData | null> {
	const allData = await fetchAllHoroscopesData();
	if (!allData || !allData.horoscopes[zodiacEn]) {
		logDebug('Failed to get horoscope data for zodiac', { zodiacEn });
		return null;
	}

	return allData.horoscopes[zodiacEn];
}

// 取得快取的占星資料
export async function getCachedHoroscope(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
	const todayKey = DateUtils.getTodayKey();
	const cacheKey = `${todayKey}_${zodiacKey}`;

	try {
		const cached = await kv.get(cacheKey);
		if (cached) {
			const parsed = JSON.parse(cached) as CachedHoroscope;
			logDebug('Cache hit for horoscope', { zodiacKey });
			return parsed;
		}

		logDebug('Cache miss for horoscope', { zodiacKey });
		return null;
	} catch (error) {
		logDebug('Error getting cached horoscope', { zodiacKey, error });
		return null;
	}
}

// 快取占星資料
export async function cacheHoroscope(kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> {
	const todayKey = DateUtils.getTodayKey();
	const cacheKey = `${todayKey}_${zodiacKey}`;

	const cachedData: CachedHoroscope = {
		data,
		cachedAt: new Date().toISOString(),
	};

	try {
		await kv.put(cacheKey, JSON.stringify(cachedData), {
			expirationTtl: CONFIG.CACHE.EXPIRATION,
		});
		logDebug('Cached horoscope data', { zodiacKey });
	} catch (error) {
		logDebug('Error caching horoscope data', { zodiacKey, error });
	}
}

// 預載所有占星資料
export async function preloadAllHoroscopes(kv: KVNamespace): Promise<void> {
	logDebug('Starting horoscope preload');

	try {
		const allData = await fetchAllHoroscopesData();
		if (!allData) {
			logDebug('Failed to fetch all horoscope data');
			return;
		}

		const allZodiacs = Object.keys(zodiacMap);
		logDebug('Caching all horoscope data', {
			totalConstellations: allData.totalConstellations,
			successCount: allData.successCount,
		});

		// 快取所有星座資料
		for (const zodiacKey of allZodiacs) {
			const zodiacEn = zodiacMap[zodiacKey];
			const horoscopeData = allData.horoscopes[zodiacEn];

			if (horoscopeData && horoscopeData.success) {
				await cacheHoroscope(kv, zodiacKey, horoscopeData);
				logDebug('Cached horoscope data', { zodiacKey, zodiacEn });
			} else {
				logDebug('No data available for zodiac', { zodiacKey, zodiacEn });
			}
		}

		logDebug('Completed horoscope preload');
	} catch (error) {
		logDebug('Error in preload process', { error });
	}
}

// 尋找星座匹配
export function findZodiacMatch(text: string): string | undefined {
	// 正規化文字（處理 Unicode 變體）
	const normalizedText = text.normalize('NFKC');

	// 檢查文字長度，只有2個字或3個字才進行匹配
	if (normalizedText.length < 2 || normalizedText.length > 3) {
		return undefined;
	}

	// 嘗試各種匹配方法
	const exactMatch = Object.keys(zodiacMap).find((z) => normalizedText === z || normalizedText === z + '座');
	if (exactMatch) {
		return exactMatch;
	}

	const textWithoutSeat = normalizedText.endsWith('座') ? normalizedText.slice(0, -1) : normalizedText;
	const matchWithoutSeat = Object.keys(zodiacMap).find((z) => textWithoutSeat === z);
	if (matchWithoutSeat) {
		return matchWithoutSeat;
	}

	const fuzzyMatch = Object.keys(zodiacMap).find((z) => normalizedText.includes(z));
	if (fuzzyMatch) {
		return fuzzyMatch;
	}

	return undefined;
}

// 格式化占星回覆
export async function formatHoroscopeReply(data: HoroscopeData, zodiacKey: string): Promise<string> {
	const displayDate = DateUtils.getTodayDate();

	return `今日運勢 ( ${displayDate} ) ${zodiacKey}座
📝 今日提醒：${data.data.notice}
✅ 宜：${data.data.yi}
❌ 忌：${data.data.ji}
💕 愛情運 (${data.data.love})
${data.data.love_text}
💼 事業運 (${data.data.work})
${truncateToFirstPeriod(data.data.work_text)}
💰 金錢運 (${data.data.money})
${truncateToFirstPeriod(data.data.money_text)}
🏥 健康運 (${data.data.health})
${truncateToFirstPeriod(data.data.health_text)}
🍀 幸運數字：${data.data.lucky_number}
🎨 幸運顏色：${data.data.lucky_color}
🌟 幸運星座：${data.data.lucky_star}`;
}

// 取得自訂占星訊息（許雲藏專用）
export async function getCustomHoroscopeForUser(zodiacKey: string): Promise<string> {
	const todayDate = DateUtils.getTodayDate();
	return `今日運勢 ( ${todayDate} ) ${zodiacKey}座

📝 今日提醒：多做愛
✅ 宜：做愛
❌ 忌：不做愛
💕 愛情運 (100%)
今天是個適合做愛的日子，單身的可以約炮，有伴的可以盡情享受。
💼 事業運 (100%)
今天是個適合做愛的日子，做愛能提升你的工作效率和創造力。
💰 金錢運 (100%)
今天是個適合做愛的日子，做愛後財運會大幅提升。
🏥 健康運 (100%)
今天是個適合做愛的日子，做愛是最好的運動和保健方式。
🍀 幸運數字：69
🎨 幸運顏色：精液白
🌟 幸運星座：可憐沒有`;
}
