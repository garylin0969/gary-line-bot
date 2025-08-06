import * as OpenCC from 'opencc-js';
import { CONFIG, zodiacMap } from '../config/constants.js';
import { HoroscopeData, HoroscopeResponse, CachedHoroscope } from '../types/index.js';
import { truncateToFirstPeriod } from '../utils/common.js';
import { DateUtils } from '../utils/date.js';

// OpenCC 轉換器
let converter: Promise<(text: string) => Promise<string>> | null = null;

const getConverter = async (): Promise<(text: string) => Promise<string>> => {
	if (!converter) {
		converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
	}
	return converter;
};

// 轉換星座運勢資料
const convertHoroscopeData = async (data: HoroscopeData): Promise<HoroscopeData> => {
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

		return convertedData;
	} catch (error) {
		return data; // 轉換失敗時返回原始資料
	}
};

// 取得星座快取鍵
const getHoroscopeKey = (zodiacKey: string): string => {
	const todayKey = DateUtils.getTodayKey();
	return `${todayKey}_${zodiacKey}`;
};

// 檢查是否為今日
const isToday = (dateString: string): boolean => {
	const cachedDate = dateString; // YYYY-MM-DD 格式
	const today = DateUtils.getTodayDate(); // MM/DD 格式

	// 將 API 日期格式 (YYYY-MM-DD) 轉換為 MM/DD 格式進行比較
	const cachedDateFormatted = cachedDate.substring(5).replace('-', '/'); // "2025-07-23" -> "07/23"

	return cachedDateFormatted === today;
};

// 取得所有占星資料
export const fetchAllHoroscopesData = async (): Promise<HoroscopeResponse | null> => {
	try {
		const response = await fetch(CONFIG.API.HOROSCOPE);

		if (!response.ok) {
			return null;
		}

		const horoscopeData = (await response.json()) as HoroscopeResponse;
		return horoscopeData;
	} catch (error) {
		return null;
	}
};

// 取得特定星座占星資料
export const fetchHoroscopeData = async (zodiacEn: string): Promise<HoroscopeData | null> => {
	const allData = await fetchAllHoroscopesData();
	if (!allData || !allData.horoscopes[zodiacEn]) {
		return null;
	}

	// 轉換為繁體中文
	const convertedData = await convertHoroscopeData(allData.horoscopes[zodiacEn]);
	return convertedData;
};

// 取得快取的占星資料
export const getCachedHoroscope = async (kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> => {
	const cacheKey = getHoroscopeKey(zodiacKey);

	try {
		const cached = await kv.get(cacheKey);
		if (!cached) {
			return null;
		}

		const parsed = JSON.parse(cached) as CachedHoroscope;

		// 檢查快取資料的日期是否為今日
		const cachedDate = parsed.data.data.date;

		if (isToday(cachedDate)) {
			return parsed;
		} else {
			// 快取資料不是今日的，需要重新獲取
			return await refreshHoroscopeData(kv, zodiacKey);
		}
	} catch (error) {
		return null;
	}
};

// 重新獲取星座資料
const refreshHoroscopeData = async (kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> => {
	const zodiacEn = zodiacMap[zodiacKey];
	const freshData = await fetchHoroscopeData(zodiacEn);

	if (freshData && freshData.success) {
		// 更新快取（資料已經在 fetchHoroscopeData 中轉換為繁體）
		await cacheHoroscope(kv, zodiacKey, freshData);

		return {
			data: freshData,
			cachedAt: new Date().toISOString(),
		};
	} else {
		return null;
	}
};

// 快取占星資料
export const cacheHoroscope = async (kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> => {
	const cacheKey = getHoroscopeKey(zodiacKey);

	const cachedData: CachedHoroscope = {
		data,
		cachedAt: new Date().toISOString(),
	};

	try {
		await kv.put(cacheKey, JSON.stringify(cachedData), {
			expirationTtl: CONFIG.CACHE.EXPIRATION,
		});
	} catch (error) {
		// 快取失敗時靜默處理
	}
};

// 預載所有占星資料
export const preloadAllHoroscopes = async (kv: KVNamespace): Promise<void> => {
	try {
		const allData = await fetchAllHoroscopesData();
		if (!allData) {
			return;
		}

		const allZodiacs = Object.keys(zodiacMap);

		// 並行快取所有星座資料
		const cachePromises = allZodiacs.map(async (zodiacKey) => {
			const zodiacEn = zodiacMap[zodiacKey];
			const horoscopeData = allData.horoscopes[zodiacEn];

			if (horoscopeData && horoscopeData.success) {
				// 轉換為繁體中文後再快取
				const convertedData = await convertHoroscopeData(horoscopeData);
				await cacheHoroscope(kv, zodiacKey, convertedData);
			}
		});

		await Promise.all(cachePromises);
	} catch (error) {
		// 預載失敗時靜默處理
	}
};

// 尋找星座匹配
export const findZodiacMatch = (text: string): string | undefined => {
	// 正規化文字（處理 Unicode 變體）
	const normalizedText = text.normalize('NFKC');

	// 檢查文字長度，只有2個字或3個字才進行匹配
	if (normalizedText.length < 2 || normalizedText.length > 3) {
		return undefined;
	}

	const zodiacPatterns = Object.keys(zodiacMap);

	// 嘗試各種匹配方法
	const exactMatch = zodiacPatterns.find((z) => normalizedText === z || normalizedText === z + '座');
	if (exactMatch) {
		return exactMatch;
	}

	const textWithoutSeat = normalizedText.endsWith('座') ? normalizedText.slice(0, -1) : normalizedText;
	const matchWithoutSeat = zodiacPatterns.find((z) => textWithoutSeat === z);
	if (matchWithoutSeat) {
		return matchWithoutSeat;
	}

	const fuzzyMatch = zodiacPatterns.find((z) => normalizedText.includes(z));
	if (fuzzyMatch) {
		return fuzzyMatch;
	}

	return undefined;
};

// 格式化占星回覆
export const formatHoroscopeReply = async (data: HoroscopeData, zodiacKey: string): Promise<string> => {
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
};

// 取得自訂占星訊息（許雲藏專用）
export const getCustomHoroscopeForUser = async (zodiacKey: string): Promise<string> => {
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
};
