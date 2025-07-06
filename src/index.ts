import * as OpenCC from 'opencc-js';

interface LineEvent {
	type: string;
	message?: {
		type: string;
		text: string;
	};
	replyToken?: string;
	source?: {
		type: string;
	};
}

interface Env {
	LINE_CHANNEL_ACCESS_TOKEN: string;
	HOROSCOPE_CACHE: KVNamespace;
}

interface HoroscopeData {
	type: string;
	name: string;
	title: string;
	time: string;
	todo: {
		yi: string;
		ji: string;
	};
	fortune: {
		all: number;
		love: number;
		work: number;
		money: number;
		health: number;
	};
	shortcomment: string;
	fortunetext: {
		all: string;
		love: string;
		work: string;
		money: string;
		health: string;
	};
	luckynumber: string;
	luckycolor: string;
	luckyconstellation: string;
	index: {
		all: string;
		love: string;
		work: string;
		money: string;
		health: string;
	};
}

interface CachedHoroscope {
	data: HoroscopeData;
	cachedAt: string;
}

const zodiacMap: Record<string, string> = {
	牡羊: 'aries',
	白羊: 'aries',
	金牛: 'taurus',
	雙子: 'gemini',
	双子: 'gemini',
	巨蟹: 'cancer',
	巨蠍: 'cancer',
	獅子: 'leo',
	狮子: 'leo',
	處女: 'virgo',
	处女: 'virgo',
	天秤: 'libra',
	天蠍: 'scorpio',
	天蝎: 'scorpio',
	射手: 'sagittarius',
	魔羯: 'capricorn',
	摩羯: 'capricorn',
	水瓶: 'aquarius',
	雙魚: 'pisces',
	双鱼: 'pisces',
};

function stars(n: number): string {
	const full = '★'.repeat(n);
	const empty = '☆'.repeat(5 - n);
	return full + empty;
}

function truncateToFirstPeriod(text: string): string {
	const periodIndex = text.indexOf('。');
	if (periodIndex !== -1) {
		return text.substring(0, periodIndex + 1);
	}
	return text;
}

function logDebug(message: string, data?: any) {
	console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
}

function getTodayKey(): string {
	const now = new Date();
	const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
	return utc8.toISOString().split('T')[0];
}

function getTodayDate(): string {
	const now = new Date();
	const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
	const month = String(utc8.getMonth() + 1).padStart(2, '0');
	const day = String(utc8.getDate()).padStart(2, '0');
	return `${month}/${day}`;
}

async function fetchHoroscopeData(zodiacEn: string): Promise<HoroscopeData | null> {
	const apiUrl = `https://api.vvhan.com/api/horoscope?type=${zodiacEn}&time=today`;

	try {
		logDebug(`Fetching horoscope from API: ${apiUrl}`);
		const response = await fetch(apiUrl);
		logDebug(`API response status: ${response.status}`);

		const horoscope = (await response.json()) as { success: boolean; data: HoroscopeData };
		logDebug(`API response data:`, horoscope);

		if (horoscope.success && horoscope.data) {
			logDebug(`Successfully fetched horoscope for ${zodiacEn}`);
			return horoscope.data;
		}

		logDebug(`API returned success: ${horoscope.success}, has data: ${!!horoscope.data}`);
		return null;
	} catch (error) {
		logDebug(`Error fetching horoscope for ${zodiacEn}:`, error);
		return null;
	}
}

async function getCachedHoroscope(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
	const todayKey = getTodayKey();
	const cacheKey = `${todayKey}_${zodiacKey}`;

	try {
		const cached = await kv.get(cacheKey);
		if (cached) {
			const parsed = JSON.parse(cached) as CachedHoroscope;
			logDebug(`Cache hit for ${zodiacKey}`, parsed);
			return parsed;
		}

		logDebug(`Cache miss for ${zodiacKey}`);
		return null;
	} catch (error) {
		logDebug(`Error getting cached horoscope for ${zodiacKey}:`, error);
		return null;
	}
}

async function cacheHoroscope(kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> {
	const todayKey = getTodayKey();
	const cacheKey = `${todayKey}_${zodiacKey}`;

	const cachedData: CachedHoroscope = {
		data,
		cachedAt: new Date().toISOString(),
	};

	try {
		await kv.put(cacheKey, JSON.stringify(cachedData), {
			expirationTtl: 25 * 60 * 60, // 25小時後過期
		});
		logDebug(`Cached horoscope for ${zodiacKey}`);
	} catch (error) {
		logDebug(`Error caching horoscope for ${zodiacKey}:`, error);
	}
}

async function preloadAllHoroscopes(kv: KVNamespace): Promise<void> {
	logDebug('Starting preload of all horoscopes');

	const allZodiacs = Object.keys(zodiacMap);
	const uniqueZodiacEns = [...new Set(Object.values(zodiacMap))];

	logDebug('Unique zodiac ENs:', uniqueZodiacEns);

	for (const zodiacEn of uniqueZodiacEns) {
		try {
			logDebug(`Preloading ${zodiacEn}...`);
			const data = await fetchHoroscopeData(zodiacEn);

			if (data) {
				// 為所有對應的中文星座名稱創建快取
				const zodiacKeys = allZodiacs.filter((key) => zodiacMap[key] === zodiacEn);
				logDebug(`Caching ${zodiacEn} for keys:`, zodiacKeys);

				for (const key of zodiacKeys) {
					await cacheHoroscope(kv, key, data);
				}

				logDebug(`Successfully preloaded ${zodiacEn}`);
			} else {
				logDebug(`Failed to fetch data for ${zodiacEn}`);
			}
		} catch (error) {
			logDebug(`Error preloading ${zodiacEn}:`, error);
		}
	}

	logDebug('Completed preload of all horoscopes');
}

function findZodiacMatch(text: string): string | undefined {
	// 正規化文字（處理 Unicode 變體）
	const normalizedText = text.normalize('NFKC');

	// 檢查文字長度，只有2個字或3個字才進行匹配
	if (normalizedText.length < 2 || normalizedText.length > 3) {
		logDebug(`Text length ${normalizedText.length} not suitable for zodiac matching`);
		return undefined;
	}

	// 記錄調試資訊
	logDebug('Normalized text:', normalizedText);
	logDebug(
		'Text char codes:',
		Array.from(normalizedText).map((c) => `${c}(${c.charCodeAt(0)})`)
	);

	// 檢查每個星座的字符碼
	Object.keys(zodiacMap).forEach((zodiac) => {
		const zodiacCodes = Array.from(zodiac).map((c) => `${c}(${c.charCodeAt(0)})`);
		logDebug(`Zodiac ${zodiac} char codes:`, zodiacCodes);

		// 檢查是否完全匹配
		if (normalizedText === zodiac || normalizedText === zodiac + '座') {
			logDebug(`Exact match found: ${zodiac}`);
		}
	});

	// 嘗試各種匹配方法
	const exactMatch = Object.keys(zodiacMap).find((z) => normalizedText === z || normalizedText === z + '座');
	if (exactMatch) {
		logDebug('Exact match result:', exactMatch);
		return exactMatch;
	}

	const textWithoutSeat = normalizedText.endsWith('座') ? normalizedText.slice(0, -1) : normalizedText;
	const matchWithoutSeat = Object.keys(zodiacMap).find((z) => textWithoutSeat === z);
	if (matchWithoutSeat) {
		logDebug('Match without seat result:', matchWithoutSeat);
		return matchWithoutSeat;
	}

	const fuzzyMatch = Object.keys(zodiacMap).find((z) => normalizedText.includes(z));
	if (fuzzyMatch) {
		logDebug('Fuzzy match result:', fuzzyMatch);
		return fuzzyMatch;
	}

	logDebug('No match found for:', normalizedText);
	return undefined;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 手動預載端點
		if (url.pathname === '/preload' && request.method === 'GET') {
			logDebug('Manual preload triggered');
			await preloadAllHoroscopes(env.HOROSCOPE_CACHE);
			return new Response('Preload completed', { status: 200 });
		}

		if (request.method !== 'POST') {
			return new Response('OK', { status: 200 });
		}

		const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;

		const body = (await request.json()) as { events: LineEvent[] };
		const events: LineEvent[] = body.events;

		const opencc = await OpenCC.Converter({ from: 'cn', to: 'tw' });

		const responses = events.map(async (event) => {
			if (event.type === 'message' && event.message?.type === 'text') {
				const originalText = event.message.text.trim();
				const text = (await opencc(originalText)).trim();

				logDebug('Original text:', originalText);
				logDebug('Converted text:', text);
				logDebug('Available zodiac keys:', Object.keys(zodiacMap));

				const match = findZodiacMatch(text);
				logDebug('Match found:', match);

				if (!match) {
					return;
				}

				// 首先嘗試從快取獲取資料
				let data: HoroscopeData | null = null;
				const cachedData = await getCachedHoroscope(env.HOROSCOPE_CACHE, match);

				if (cachedData) {
					logDebug('Using cached data for:', match);
					data = cachedData.data;
				} else {
					logDebug('Cache miss, checking if cache is empty');

					// 檢查是否已經有其他星座被快取，來判斷是否需要預載
					const todayKey = getTodayKey();
					const checkKeys = ['牡羊', '金牛', '雙子']; // 檢查幾個常見星座
					const cacheChecks = await Promise.all(checkKeys.map((key) => env.HOROSCOPE_CACHE.get(`${todayKey}_${key}`)));
					const hasAnyCache = cacheChecks.some((cache) => cache !== null);

					if (!hasAnyCache) {
						logDebug('Cache is empty, preloading all horoscopes');
						await preloadAllHoroscopes(env.HOROSCOPE_CACHE);

						// 重新嘗試獲取快取資料
						const newCachedData = await getCachedHoroscope(env.HOROSCOPE_CACHE, match);
						if (newCachedData) {
							logDebug('Using newly cached data for:', match);
							data = newCachedData.data;
						}
					}

					// 如果仍然沒有資料，則單獨獲取該星座資料
					if (!data) {
						logDebug('Fetching individual horoscope for:', match);
						const zodiacEn = zodiacMap[match];
						data = await fetchHoroscopeData(zodiacEn);

						if (data) {
							// 快取獲取到的資料
							await cacheHoroscope(env.HOROSCOPE_CACHE, match, data);
						}
					}
				}

				if (!data) {
					logDebug('No data available for:', match);
					return;
				}

				const toTw = (s: string): Promise<string> => opencc(s || '');

				const loveText = truncateToFirstPeriod(await toTw(data.fortunetext.love));
				const workText = truncateToFirstPeriod(await toTw(data.fortunetext.work));
				const moneyText = truncateToFirstPeriod(await toTw(data.fortunetext.money));
				const healthText = truncateToFirstPeriod(await toTw(data.fortunetext.health));
				const luckyColor = await toTw(data.luckycolor);

				const loveStars = stars(data.fortune.love);
				const workStars = stars(data.fortune.work);
				const moneyStars = stars(data.fortune.money);
				const healthStars = stars(data.fortune.health);
				const todayDate = getTodayDate();

				const replyText = `今日運勢 ( ${todayDate} ) ${match}座
愛情運 ${loveStars}
${loveText}
事業運 ${workStars}
${workText}
金錢運 ${moneyStars}
${moneyText}
健康運 ${healthStars}
${healthText}
幸運數字 : ${data.luckynumber}。幸運顏色 : ${luckyColor}`;

				await fetch('https://api.line.me/v2/bot/message/reply', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({
						replyToken: event.replyToken,
						messages: [{ type: 'text', text: replyText }],
					}),
				});
			}
		});

		await Promise.all(responses);

		return new Response('OK', { status: 200 });
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		logDebug('Scheduled event triggered at:', event.scheduledTime);

		// 預載所有星座的運勢資料
		await preloadAllHoroscopes(env.HOROSCOPE_CACHE);

		logDebug('Scheduled preload completed');
	},
};
