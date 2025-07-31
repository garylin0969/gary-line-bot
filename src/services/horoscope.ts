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

// 簡體轉繁體轉換器
class TraditionalConverter {
	// 轉換單一文字
	static async convertText(text: string): Promise<string> {
		try {
			const converter = await getConverter();
			return await converter(text);
		} catch (error) {
			logDebug('Error converting text to traditional', { error, text });
			return text; // 轉換失敗時返回原文
		}
	}

	// 轉換星座運勢資料
	static async convertHoroscopeData(data: HoroscopeData): Promise<HoroscopeData> {
		try {
			const converter = await getConverter();

			// 轉換所有文字欄位
			const convertedData = {
				...data,
				data: {
					...data.data,
					ji: await converter(data.data.ji),
					yi: await converter(data.data.yi),
					all: await converter(data.data.all),
					love: await converter(data.data.love),
					work: await converter(data.data.work),
					money: await converter(data.data.money),
					health: await converter(data.data.health),
					notice: await converter(data.data.notice),
					discuss: await converter(data.data.discuss),
					all_text: await converter(data.data.all_text),
					love_text: await converter(data.data.love_text),
					work_text: await converter(data.data.work_text),
					money_text: await converter(data.data.money_text),
					health_text: await converter(data.data.health_text),
					lucky_color: await converter(data.data.lucky_color),
					lucky_star: await converter(data.data.lucky_star),
				},
			};

			logDebug('Successfully converted horoscope data to traditional', { constellation: data.constellation });
			return convertedData;
		} catch (error) {
			logDebug('Error converting horoscope data to traditional', { error, constellation: data.constellation });
			return data; // 轉換失敗時返回原始資料
		}
	}
}

// 快取鍵生成器
class CacheKeyGenerator {
	static getHoroscopeKey(zodiacKey: string): string {
		const todayKey = DateUtils.getTodayKey();
		return `${todayKey}_${zodiacKey}`;
	}
}

// 日期驗證器
class DateValidator {
	static isToday(dateString: string): boolean {
		const cachedDate = dateString; // YYYY-MM-DD 格式
		const today = DateUtils.getTodayDate(); // MM/DD 格式

		// 將 API 日期格式 (YYYY-MM-DD) 轉換為 MM/DD 格式進行比較
		const cachedDateFormatted = cachedDate.substring(5).replace('-', '/'); // "2025-07-23" -> "07/23"

		logDebug('Checking cached horoscope date', {
			cachedDate,
			cachedDateFormatted,
			today,
			isToday: cachedDateFormatted === today,
		});

		return cachedDateFormatted === today;
	}
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

	// 轉換為繁體中文
	const convertedData = await TraditionalConverter.convertHoroscopeData(allData.horoscopes[zodiacEn]);
	return convertedData;
}

// 取得快取的占星資料
export async function getCachedHoroscope(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
	const cacheKey = CacheKeyGenerator.getHoroscopeKey(zodiacKey);

	try {
		const cached = await kv.get(cacheKey);
		if (!cached) {
			logDebug('Cache miss for horoscope', { zodiacKey });
			return null;
		}

		const parsed = JSON.parse(cached) as CachedHoroscope;

		// 檢查快取資料的日期是否為今日
		const cachedDate = parsed.data.data.date;

		if (DateValidator.isToday(cachedDate)) {
			logDebug('Cache hit for horoscope (today)', { zodiacKey });
			return parsed;
		} else {
			// 快取資料不是今日的，需要重新獲取
			logDebug('Cache data is outdated, fetching fresh data', { zodiacKey, cachedDate });
			return await refreshHoroscopeData(kv, zodiacKey);
		}
	} catch (error) {
		logDebug('Error getting cached horoscope', { zodiacKey, error });
		return null;
	}
}

// 重新獲取星座資料
async function refreshHoroscopeData(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
	const zodiacEn = zodiacMap[zodiacKey];
	const freshData = await fetchHoroscopeData(zodiacEn);

	if (freshData && freshData.success) {
		// 更新快取（資料已經在 fetchHoroscopeData 中轉換為繁體）
		await cacheHoroscope(kv, zodiacKey, freshData);
		logDebug('Updated cache with fresh horoscope data', { zodiacKey });

		return {
			data: freshData,
			cachedAt: new Date().toISOString(),
		};
	} else {
		logDebug('Failed to fetch fresh horoscope data', { zodiacKey });
		return null;
	}
}

// 快取占星資料
export async function cacheHoroscope(kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> {
	const cacheKey = CacheKeyGenerator.getHoroscopeKey(zodiacKey);

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

		// 並行快取所有星座資料
		const cachePromises = allZodiacs.map(async (zodiacKey) => {
			const zodiacEn = zodiacMap[zodiacKey];
			const horoscopeData = allData.horoscopes[zodiacEn];

			if (horoscopeData && horoscopeData.success) {
				// 轉換為繁體中文後再快取
				const convertedData = await TraditionalConverter.convertHoroscopeData(horoscopeData);
				await cacheHoroscope(kv, zodiacKey, convertedData);
				logDebug('Cached horoscope data', { zodiacKey, zodiacEn });
			} else {
				logDebug('No data available for zodiac', { zodiacKey, zodiacEn });
			}
		});

		await Promise.all(cachePromises);
		logDebug('Completed horoscope preload');
	} catch (error) {
		logDebug('Error in preload process', { error });
	}
}

// 星座匹配器
class ZodiacMatcher {
	private static readonly ZODIAC_PATTERNS = Object.keys(zodiacMap);

	static findMatch(text: string): string | undefined {
		// 正規化文字（處理 Unicode 變體）
		const normalizedText = text.normalize('NFKC');

		// 檢查文字長度，只有2個字或3個字才進行匹配
		if (normalizedText.length < 2 || normalizedText.length > 3) {
			return undefined;
		}

		// 嘗試各種匹配方法
		const exactMatch = this.ZODIAC_PATTERNS.find((z) => normalizedText === z || normalizedText === z + '座');
		if (exactMatch) {
			return exactMatch;
		}

		const textWithoutSeat = normalizedText.endsWith('座') ? normalizedText.slice(0, -1) : normalizedText;
		const matchWithoutSeat = this.ZODIAC_PATTERNS.find((z) => textWithoutSeat === z);
		if (matchWithoutSeat) {
			return matchWithoutSeat;
		}

		const fuzzyMatch = this.ZODIAC_PATTERNS.find((z) => normalizedText.includes(z));
		if (fuzzyMatch) {
			return fuzzyMatch;
		}

		return undefined;
	}
}

// 尋找星座匹配
export function findZodiacMatch(text: string): string | undefined {
	return ZodiacMatcher.findMatch(text);
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
