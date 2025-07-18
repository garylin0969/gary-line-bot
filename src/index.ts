import * as OpenCC from 'opencc-js';

// Constants configuration
const CONFIG = {
	ROLL: {
		MAX_PLAYERS: 10,
		TIMEOUT: 30 * 60 * 1000, // 30分鐘
	},
	CACHE: {
		EXPIRATION: 25 * 60 * 60, // 25小時後過期
	},
	API: {
		RANDOM_GIRL_IMAGE_JSON: 'https://api.vvhan.com/api/avatar/girl?type=json',
		RANDOM_GIRL_IMAGE: 'https://api.vvhan.com/api/avatar/girl',
		RANDOM_PORN_IMAGE: 'https://image.anosu.top/pixiv?r18=1&size=small',
		LINE_REPLY: 'https://api.line.me/v2/bot/message/reply',
		HOROSCOPE: 'https://api.vvhan.com/api/horoscope',
		SEXY_TEXT: 'https://api.vvhan.com/api/text/sexy?type=json',
		DOG_TEXT: 'https://api.vvhan.com/api/text/dog?type=json',
	},
} as const;

const KEY_WORDS_REPLY = {
	張瑋烝: '又偷操學生妹==',
	'@張瑋烝': '又偷操學生妹==',
	許雲藏: '又再做愛？',
	'@許雲藏': '又再做愛？',
	皓: '現在考到N幾了？',
	'@皓(Ryan)': '現在考到N幾了？',
	stanley: '勝利爸爸...',
	'@stanley': '勝利爸爸...',
	笑死: '啊是死了沒辣',
	幹: '好 幹我 幹死我',
	勝利: '那ㄋ很失敗囉？',
	花式炫: '炫你嘴裡',
	又在炫: '炫你嘴裡',
	靠北: '順便靠母了嗎 恭喜',
	這我: '又你了',
	幹你娘: '先幹我',
	幹妳娘: '先幹我',
	早安: '沒人想跟你打招呼',
	'？': '？你媽',
	'?': '？你媽',
};

// Types and Interfaces
interface LineEvent {
	type: string;
	message?: {
		type: string;
		text: string;
	};
	replyToken?: string;
	source?: {
		type: string;
		groupId?: string;
		userId?: string;
	};
}

interface Env {
	LINE_CHANNEL_ACCESS_TOKEN: string;
	HOROSCOPE_CACHE: KVNamespace;
	GAME_STATE: DurableObjectNamespace;
}

interface RandomImageResponse {
	success: boolean;
	type: string;
	url: string;
}

interface TextResponse {
	success: boolean;
	type: string;
	data: {
		id: number;
		content: string;
	};
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

// Game State Types
interface GameState {
	players: Record<string, number>;
	maxPlayers: number;
	startedAt: number;
}

interface RollResponse {
	point: number;
	isComplete: boolean;
	players: Record<string, number>;
}

interface LineMessage {
	type: string;
	text?: string;
	originalContentUrl?: string;
	previewImageUrl?: string;
}

// Durable Object for Game State
export class GameStateObject {
	private state: DurableObjectState;
	private games: Record<string, GameState>;

	constructor(state: DurableObjectState) {
		this.state = state;
		this.games = {};
		// 初始化時從 storage 讀取遊戲狀態
		this.initializeState();
	}

	private async initializeState() {
		const stored = (await this.state.storage.get('games')) as Record<string, GameState>;
		if (stored) {
			this.games = stored;
			// 清理過期的遊戲
			for (const [groupId, game] of Object.entries(this.games)) {
				if (Date.now() - game.startedAt > CONFIG.ROLL.TIMEOUT) {
					delete this.games[groupId];
				}
			}
			await this.state.storage.put('games', this.games);
		}
	}

	private async saveState() {
		await this.state.storage.put('games', this.games);
	}

	async fetch(request: Request) {
		await this.initializeState(); // 每次請求時確保狀態是最新的

		const url = new URL(request.url);
		const groupId = url.searchParams.get('groupId');
		if (!groupId) {
			return new Response('Missing groupId', { status: 400 });
		}

		const action = url.searchParams.get('action');
		if (action === 'create') {
			const maxPlayers = parseInt(url.searchParams.get('maxPlayers') || '0');
			if (maxPlayers < 2 || maxPlayers > CONFIG.ROLL.MAX_PLAYERS) {
				return new Response('Invalid maxPlayers', { status: 400 });
			}

			this.games[groupId] = {
				players: {},
				maxPlayers,
				startedAt: Date.now(),
			};
			logDebug('DO: Created new game', {
				groupId,
				maxPlayers,
				game: this.games[groupId],
			});
			await this.saveState();
			return new Response(JSON.stringify(this.games[groupId]));
		} else if (action === 'get') {
			const game = this.games[groupId];
			if (!game || Date.now() - game.startedAt > CONFIG.ROLL.TIMEOUT) {
				delete this.games[groupId];
				await this.saveState();
				logDebug('DO: Game not found or expired', {
					groupId,
					hasGame: !!game,
					timeElapsed: game ? Date.now() - game.startedAt : null,
				});
				return new Response(null);
			}
			logDebug('DO: Retrieved game', {
				groupId,
				game,
			});
			return new Response(JSON.stringify(game));
		} else if (action === 'roll') {
			const game = this.games[groupId];
			if (!game || Date.now() - game.startedAt > CONFIG.ROLL.TIMEOUT) {
				delete this.games[groupId];
				await this.saveState();
				logDebug('DO: Game not found or expired during roll', {
					groupId,
					hasGame: !!game,
					timeElapsed: game ? Date.now() - game.startedAt : null,
				});
				return new Response(null);
			}

			const userId = url.searchParams.get('userId');
			if (!userId) {
				return new Response('Missing userId', { status: 400 });
			}

			const currentPlayerCount = Object.keys(game.players).length;
			logDebug('DO: Current game state before roll', {
				groupId,
				userId,
				currentPlayerCount,
				maxPlayers: game.maxPlayers,
				players: game.players,
			});

			if (currentPlayerCount >= game.maxPlayers) {
				logDebug('DO: Game is full', {
					groupId,
					currentPlayerCount,
					maxPlayers: game.maxPlayers,
				});
				return new Response('Game is full', { status: 400 });
			}

			if (game.players[userId] !== undefined) {
				logDebug('DO: User already rolled', {
					groupId,
					userId,
					existingRoll: game.players[userId],
				});
				return new Response('Already rolled', { status: 400 });
			}

			const point = Math.floor(Math.random() * 100) + 1;
			game.players[userId] = point;

			// 重新計算玩家數量，因為我們剛剛添加了新玩家
			const newPlayerCount = Object.keys(game.players).length;
			const isComplete = newPlayerCount === game.maxPlayers;

			logDebug('DO: Roll completed', {
				groupId,
				userId,
				point,
				newPlayerCount,
				maxPlayers: game.maxPlayers,
				isComplete,
				allPlayers: game.players,
			});

			const response = {
				point,
				isComplete,
				players: game.players,
			};

			if (isComplete) {
				logDebug('DO: Game completed, cleaning up', {
					groupId,
					finalState: game,
					playerCount: newPlayerCount,
					maxPlayers: game.maxPlayers,
				});
			}

			await this.saveState();

			if (isComplete) {
				delete this.games[groupId];
				await this.saveState();
			}

			return new Response(JSON.stringify(response));
		}

		return new Response('Invalid action', { status: 400 });
	}
}

// Zodiac mapping
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

// Utility functions
function stars(n: number, seed?: string): string {
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

function truncateToFirstPeriod(text: string): string {
	const periodIndex = text.indexOf('。');
	return periodIndex !== -1 ? text.substring(0, periodIndex + 1) : text;
}

function logDebug(message: string, data?: any) {
	console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function createGameUrl(groupId: string, action: 'get' | 'create' | 'roll', params: Record<string, string> = {}): URL {
	const url = new URL('http://localhost');
	url.searchParams.set('groupId', groupId);
	url.searchParams.set('action', action);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

// Date utilities
const DateUtils = {
	getTodayKey(): string {
		const now = new Date();
		const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
		return utc8.toISOString().split('T')[0];
	},

	getTodayDate(): string {
		const now = new Date();
		const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
		const month = String(utc8.getMonth() + 1).padStart(2, '0');
		const day = String(utc8.getDate()).padStart(2, '0');
		return `${month}/${day}`;
	},
};

// API Functions
async function fetchText(apiUrl: string): Promise<string | null> {
	try {
		logDebug(`Fetching text from API: ${apiUrl}`);
		const response = await fetch(apiUrl);
		logDebug(`Text API response status: ${response.status}`);

		if (!response.ok) {
			logDebug(`API request failed with status: ${response.status}`);
			return null;
		}

		const data = (await response.json()) as TextResponse;
		logDebug(`Text API response data:`, data);

		if (data.success && data.data?.content) {
			logDebug(`Successfully fetched text: ${data.data.content}`);
			return data.data.content;
		}

		logDebug(`API request was not successful`);
		return null;
	} catch (error) {
		logDebug(`Error fetching text:`, error);
		return null;
	}
}

async function fetchRandomImage(): Promise<string | null> {
	try {
		logDebug(`Fetching random image from API: ${CONFIG.API.RANDOM_GIRL_IMAGE_JSON}`);
		const response = await fetch(CONFIG.API.RANDOM_GIRL_IMAGE_JSON);
		logDebug(`Random image API response status: ${response.status}`);

		if (!response.ok) {
			logDebug(`API request failed with status: ${response.status}`);
			return null;
		}

		const imageData = (await response.json()) as RandomImageResponse;
		logDebug(`Random image API response data:`, imageData);

		if (imageData.success && imageData.url) {
			logDebug(`Successfully fetched random image: ${imageData.url}`);
			return imageData.url;
		}

		logDebug(`API request was not successful`);
		return null;
	} catch (error) {
		logDebug(`Error fetching random image:`, error);
		return null;
	}
}

async function sendLineMessages(replyToken: string, messages: LineMessage[], accessToken: string): Promise<void> {
	await fetch(CONFIG.API.LINE_REPLY, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ replyToken, messages }),
	});
}

async function sendReply(replyToken: string, text: string, accessToken: string): Promise<void> {
	await sendLineMessages(replyToken, [{ type: 'text', text }], accessToken);
}

async function sendImageReply(replyToken: string, imageUrl: string, accessToken: string): Promise<void> {
	await sendLineMessages(
		replyToken,
		[
			{
				type: 'image',
				originalContentUrl: imageUrl,
				previewImageUrl: imageUrl,
			},
		],
		accessToken
	);
}

async function fetchGroupMemberProfile(userId: string, groupId: string, accessToken: string): Promise<string> {
	try {
		const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			logDebug('Failed to fetch group member profile', {
				userId,
				groupId,
				status: response.status,
			});
			return userId;
		}

		const profile = (await response.json()) as { displayName: string };
		return profile.displayName;
	} catch (error) {
		logDebug('Error fetching group member profile', {
			userId,
			groupId,
			error,
		});
		return userId;
	}
}

// Horoscope Functions
async function fetchHoroscopeData(zodiacEn: string): Promise<HoroscopeData | null> {
	const apiUrl = `${CONFIG.API.HOROSCOPE}?type=${zodiacEn}&time=today`;

	try {
		logDebug('Fetching horoscope data', { zodiacEn, apiUrl });
		const response = await fetch(apiUrl);
		logDebug('Horoscope API response status', { status: response.status });

		const horoscope = (await response.json()) as { success: boolean; data: HoroscopeData };
		if (horoscope.success && horoscope.data) {
			logDebug('Successfully fetched horoscope data', { zodiacEn });
			return horoscope.data;
		}

		logDebug('Failed to fetch horoscope data', {
			zodiacEn,
			success: horoscope.success,
			hasData: !!horoscope.data,
		});
		return null;
	} catch (error) {
		logDebug('Error fetching horoscope data', { zodiacEn, error });
		return null;
	}
}

async function getCachedHoroscope(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
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

async function cacheHoroscope(kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> {
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

async function preloadAllHoroscopes(kv: KVNamespace): Promise<void> {
	logDebug('Starting horoscope preload');

	const allZodiacs = Object.keys(zodiacMap);
	const uniqueZodiacEns = [...new Set(Object.values(zodiacMap))];

	logDebug('Preloading horoscopes', { uniqueZodiacEns });

	for (const zodiacEn of uniqueZodiacEns) {
		try {
			logDebug('Preloading horoscope', { zodiacEn });
			const data = await fetchHoroscopeData(zodiacEn);

			if (data) {
				const zodiacKeys = allZodiacs.filter((key) => zodiacMap[key] === zodiacEn);
				logDebug('Caching horoscope data', { zodiacEn, zodiacKeys });

				for (const key of zodiacKeys) {
					await cacheHoroscope(kv, key, data);
				}

				logDebug('Successfully preloaded horoscope', { zodiacEn });
			} else {
				logDebug('Failed to fetch horoscope data', { zodiacEn });
			}
		} catch (error) {
			logDebug('Error preloading horoscope', { zodiacEn, error });
		}
	}

	logDebug('Completed horoscope preload');
}

function findZodiacMatch(text: string): string | undefined {
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

// Roll Game Functions
async function handleRollCommand(
	groupId: string,
	userId: string,
	replyToken: string,
	text: string,
	accessToken: string,
	env: Env
): Promise<void> {
	// 先將全形符號轉換為半形符號
	const normalizedText = text.replace(/[！]/g, '!');

	logDebug('Starting roll command handling', {
		originalText: text,
		normalizedText,
		userId,
		groupId,
	});

	if (normalizedText.startsWith('!rollnum')) {
		logDebug('Detected !rollnum command');
		return handleRollNum(groupId, replyToken, normalizedText, accessToken, env);
	} else if (normalizedText === '!roll') {
		logDebug('Detected !roll command');
		return handleRoll(groupId, userId, replyToken, accessToken, env);
	} else {
		logDebug('Unknown roll command format', { text: normalizedText });
		return sendReply(replyToken, '未知的指令格式', accessToken);
	}
}

async function handleRollNum(groupId: string, replyToken: string, text: string, accessToken: string, env: Env): Promise<void> {
	logDebug('Processing !rollnum command', { groupId });

	// First check if there's an active game
	const id = env.GAME_STATE.idFromName(groupId);
	const obj = env.GAME_STATE.get(id);

	const resp = await obj.fetch(createGameUrl(groupId, 'get'));
	const responseText = await resp.text();
	const game = resp.ok && responseText ? (JSON.parse(responseText) as GameState) : null;

	if (game) {
		logDebug('Active game found when trying to create new game', { groupId });
		await sendReply(replyToken, '還有正在進行中的比大小，先比完好嗎 親 ~~', accessToken);
		return;
	}

	const parts = text.split(' ');
	logDebug('Command parts', { parts });

	if (parts.length !== 2) {
		logDebug('Invalid !rollnum format - wrong number of parts');
		await sendReply(replyToken, '請輸入正確格式，例如 !rollnum 3 (2~10人)', accessToken);
		return;
	}

	// 檢查是否為純整數（只包含數字）
	if (!/^\d+$/.test(parts[1])) {
		logDebug('Non-integer input detected', { rawInput: parts[1] });
		await sendReply(replyToken, `操妳媽還敢亂搞啊 我內射妳肛門${parts[1]}次`, accessToken);
		return;
	}

	const num = parseInt(parts[1]);
	logDebug('Parsed player count', { num, rawInput: parts[1] });

	if (isNaN(num) || num < 2 || num > CONFIG.ROLL.MAX_PLAYERS) {
		logDebug('Invalid player count', { num });
		await sendReply(replyToken, '請輸入正確人數，例如 !rollnum 3 (2~10人)', accessToken);
		return;
	}

	const createResp = await obj.fetch(createGameUrl(groupId, 'create', { maxPlayers: num.toString() }));
	if (!createResp.ok) {
		logDebug('Failed to create game', { status: createResp.status });
		await sendReply(replyToken, '建立遊戲失敗，請稍後再試', accessToken);
		return;
	}

	logDebug('Created new game', { groupId, maxPlayers: num });
	await sendReply(replyToken, '請依序輸入 !roll 會自動記錄比對，超過30分鐘沒比完的會自動關閉。', accessToken);
}

async function handleRoll(groupId: string, userId: string, replyToken: string, accessToken: string, env: Env): Promise<void> {
	try {
		logDebug('Starting handleRoll', { groupId, userId, replyToken });

		const id = env.GAME_STATE.idFromName(groupId);
		const obj = env.GAME_STATE.get(id);

		// First check if game exists
		let resp = await obj.fetch(createGameUrl(groupId, 'get'));
		logDebug('Get game response', { status: resp.status, ok: resp.ok });

		let responseText = await resp.text();
		logDebug('Get game response text', { responseText });

		const game = resp.ok && responseText ? (JSON.parse(responseText) as GameState) : null;
		logDebug('Parsed game state', { game });

		if (!game) {
			logDebug('No active game found', { groupId });
			await sendReply(replyToken, '還沒有進行中的比大小，請先輸入 !rollnum {人數}，例如 !rollnum 3', accessToken);
			return;
		}

		// Try to roll
		resp = await obj.fetch(createGameUrl(groupId, 'roll', { userId }));
		logDebug('Roll response', { status: resp.status, ok: resp.ok });

		if (!resp.ok) {
			const error = await resp.text();
			logDebug('Roll error response', { error });

			const errorMessages = {
				'Game is full': '參加人數已滿，無法加入',
				'Already rolled': '你已經骰過了！',
			};

			await sendReply(replyToken, errorMessages[error as keyof typeof errorMessages] || '骰子失敗，請稍後再試', accessToken);
			return;
		}

		responseText = await resp.text();
		const result = JSON.parse(responseText) as RollResponse;
		logDebug('Roll result', {
			groupId,
			userId,
			point: result.point,
			isComplete: result.isComplete,
			players: result.players,
		});

		// 獲取用戶名稱
		const displayName = await fetchGroupMemberProfile(userId, groupId, accessToken);

		if (result.isComplete) {
			logDebug('Game complete, preparing final results', { groupId, players: result.players });

			try {
				// 獲取所有玩家的名稱
				const playerNames = await Promise.all(Object.keys(result.players).map((id) => fetchGroupMemberProfile(id, groupId, accessToken)));

				const playerMap = Object.fromEntries(Object.keys(result.players).map((id, index) => [id, playerNames[index]]));
				const results = Object.entries(result.players)
					.map(([id, score]) => `${playerMap[id]} : ${score} 點`)
					.join('\n');

				const winner = Object.entries(result.players).sort((a, b) => b[1] - a[1])[0][0];

				// 在一次回覆中發送兩條訊息
				await sendLineMessages(
					replyToken,
					[
						{ type: 'text', text: `${displayName}骰出 : ${result.point} 點` },
						{ type: 'text', text: `${results}\n獲勝者為 : ${playerMap[winner]}` },
					],
					accessToken
				);

				logDebug('Final results sent successfully', { groupId, results, winner: playerMap[winner] });
			} catch (error) {
				logDebug('Error sending final results', { error, groupId });
				// 如果發送完整結果失敗，至少發送當前玩家的結果
				await sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);
			}
		} else {
			// 如果遊戲還沒結束，只發送當前玩家的結果
			await sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);
		}
	} catch (error) {
		logDebug('Error in handleRoll', {
			error,
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			errorStack: error instanceof Error ? error.stack : undefined,
			groupId,
			userId,
		});
		await sendReply(replyToken, '處理命令時發生錯誤', accessToken);
	}
}

// Message Handler Functions
let converter: Promise<(text: string) => Promise<string>> | null = null;

async function getConverter(): Promise<(text: string) => Promise<string>> {
	if (!converter) {
		converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
	}
	return converter;
}

async function handleMessage(event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> {
	try {
		logDebug('Starting message processing', { event });

		if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) {
			logDebug('Invalid message type or missing replyToken', { type: event.type, messageType: event.message?.type });
			return;
		}

		const text = event.message.text.trim();
		logDebug('Processing message', { text });

		// 先檢查是否為命令
		const isCmd = isCommand(text);
		logDebug('Command check result', { text, isCommand: isCmd });

		if (isCmd) {
			logDebug('Handling command', { text });
			await handleCommand(event, env, ctx);
			return;
		}

		logDebug('Processing as normal message', { text });
		// 處理一般文本
		await handleNormalMessage(text, event.replyToken, event.source?.userId || '', env, ctx);
	} catch (error) {
		logDebug('Error in handleMessage', { error });
	}
}

function isCommand(text: string): boolean {
	// 先將全形符號轉換為半形符號
	const normalizedText = text?.replace(/[！]/g, '!')?.toLocaleLowerCase();

	const isRoll = normalizedText === '!roll';
	const isRollNum = normalizedText.startsWith('!rollnum');
	const isDraw = normalizedText === '抽';
	const isSexy = normalizedText === '!騷話' || normalizedText === '!骚话';
	const isDog = normalizedText === '!舔狗';
	const isNSFW = text === '色色';
	const isKeyWords = Boolean(Object?.keys(KEY_WORDS_REPLY)?.find((key) => normalizedText?.includes(key)));
	const result = isRoll || isRollNum || isDraw || isSexy || isDog || isNSFW || isKeyWords;

	logDebug('Command detection', {
		originalText: text,
		normalizedText,
		isRoll,
		isRollNum,
		isDraw,
		isSexy,
		isDog,
		isNSFW,
		isKeyWords,
		result,
	});

	return result;
}

async function handleCommand(event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> {
	const text = event.message!.text.trim();
	// 先將全形符號轉換為半形符號
	const normalizedText = text.replace(/[！]/g, '!');
	logDebug('Starting command handling', { text, normalizedText });

	// 處理遊戲命令
	if (normalizedText === '!roll' || normalizedText.startsWith('!rollnum')) {
		logDebug('Detected game command', { normalizedText });
		await handleGameCommand(event, env, ctx);
		return;
	}

	// 處理「抽」命令
	if (text === '抽') {
		logDebug('Detected draw command');
		// await handleRandomImage(event.replyToken!, env); // 隨機圖片JSON版本要打api另外處理
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_GIRL_IMAGE + '?rand=' + Math.random(), env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「騷話」命令
	if (normalizedText === '!騷話' || normalizedText === '!骚话') {
		logDebug('Detected sexy text command');
		await handleSexyText(event.replyToken!, env);
		return;
	}

	// 處理「舔狗」命令
	if (normalizedText === '!舔狗') {
		logDebug('Detected dog text command');
		await handleDogText(event.replyToken!, env);
		return;
	}

	// 處理「色色」命令
	if (text === '色色') {
		logDebug('Detected NSFW command');
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_PORN_IMAGE + '?rand=' + Math.random(), env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「關鍵字」命令
	if (Object?.keys(KEY_WORDS_REPLY)?.find((key) => text?.includes(key))) {
		logDebug('Detected key words command');
		await sendReply(event.replyToken!, KEY_WORDS_REPLY[text as keyof typeof KEY_WORDS_REPLY], env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}
	logDebug('No matching command handler found', { normalizedText });
}

async function handleGameCommand(event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> {
	logDebug('Starting game command handling', {
		event,
		groupId: event.source?.groupId,
		userId: event.source?.userId,
		messageText: event.message?.text,
	});

	if (!event.source?.groupId || !event.source?.userId) {
		logDebug('Command requires group context and user ID', {
			groupId: event.source?.groupId,
			userId: event.source?.userId,
			source: event.source,
		});
		await sendReply(event.replyToken!, '此命令只能在群組中使用', env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	try {
		const text = event.message!.text.trim();
		logDebug('Processing game command', {
			command: text,
			groupId: event.source.groupId,
			userId: event.source.userId,
			source: event.source,
		});

		await handleRollCommand(event.source.groupId, event.source.userId, event.replyToken!, text, env.LINE_CHANNEL_ACCESS_TOKEN, env);
		logDebug('Game command processed successfully');
	} catch (error) {
		logDebug('Error processing game command', { error });
		await sendReply(event.replyToken!, '處理命令時發生錯誤', env.LINE_CHANNEL_ACCESS_TOKEN);
	}
}

async function handleNormalMessage(text: string, replyToken: string, userId: string, env: Env, ctx: ExecutionContext): Promise<void> {
	try {
		// 檢查星座匹配
		const match = findZodiacMatch(text);
		if (match) {
			logDebug('Found zodiac match', { match, userId });
			await handleHoroscope(match, replyToken, userId, env, ctx);
		}
	} catch (error) {
		logDebug('Error handling normal message', { error });
	}
}

async function handleRandomImage(replyToken: string, env: Env): Promise<void> {
	logDebug('Handling random image request');
	const imageUrl = await fetchRandomImage();
	if (imageUrl) {
		await sendImageReply(replyToken, imageUrl, env.LINE_CHANNEL_ACCESS_TOKEN);
	}
}

async function handleHoroscope(zodiacKey: string, replyToken: string, userId: string, env: Env, ctx: ExecutionContext): Promise<void> {
	// 檢查是否為許雲藏的訊息
	if (userId === 'U10e6659922346d74db502c05e908bc55') {
		// 請替換成許雲藏的實際 LINE User ID
		const customMessage = await getCustomHoroscopeForUser(zodiacKey);
		await sendReply(replyToken, customMessage, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	let data: HoroscopeData | null = null;
	const cachedData = await getCachedHoroscope(env.HOROSCOPE_CACHE, zodiacKey);

	if (cachedData) {
		logDebug('Using cached horoscope data', { zodiacKey });
		data = cachedData.data;
	} else {
		// 快取未命中時，直接獲取單個星座的資料
		logDebug('Cache miss, fetching individual horoscope', { zodiacKey });
		const zodiacEn = zodiacMap[zodiacKey];
		data = await fetchHoroscopeData(zodiacEn);

		if (data) {
			await cacheHoroscope(env.HOROSCOPE_CACHE, zodiacKey, data);
			// 在背景預加載其他星座資料
			ctx.waitUntil(preloadAllHoroscopes(env.HOROSCOPE_CACHE));
		}
	}

	if (!data) {
		logDebug('No horoscope data available', { zodiacKey });
		return;
	}

	const replyText = await formatHoroscopeReply(data, zodiacKey);
	await sendReply(replyToken, replyText, env.LINE_CHANNEL_ACCESS_TOKEN);
}

async function formatHoroscopeReply(data: HoroscopeData, zodiacKey: string): Promise<string> {
	const converter = await getConverter();
	const loveText = await converter(data.fortunetext.love);
	const workText = truncateToFirstPeriod(await converter(data.fortunetext.work));
	const moneyText = truncateToFirstPeriod(await converter(data.fortunetext.money));
	const healthText = truncateToFirstPeriod(await converter(data.fortunetext.health));
	const luckyColor = await converter(data.luckycolor);

	const todayDate = DateUtils.getTodayKey();
	const loveStars = stars(data.fortune.love, `${todayDate}-${zodiacKey}-love`);
	const workStars = stars(data.fortune.work, `${todayDate}-${zodiacKey}-work`);
	const moneyStars = stars(data.fortune.money, `${todayDate}-${zodiacKey}-money`);
	const healthStars = stars(data.fortune.health, `${todayDate}-${zodiacKey}-health`);
	const displayDate = DateUtils.getTodayDate();

	return `今日運勢 ( ${displayDate} ) ${zodiacKey}座
愛情運 ${loveStars}
${loveText}
事業運 ${workStars}
${workText}
金錢運 ${moneyStars}
${moneyText}
健康運 ${healthStars}
${healthText}
幸運數字 : ${data.luckynumber}。幸運顏色 : ${luckyColor}

中年人請注重自身健康：stanley、許雲藏、陳逸謙、江阿姨。`;
}

async function handleSexyText(replyToken: string, env: Env): Promise<void> {
	logDebug('Handling sexy text request');
	const text = await fetchText(CONFIG.API.SEXY_TEXT);
	if (text) {
		const converter = await getConverter();
		const traditionalText = await converter(text);
		await sendReply(replyToken, traditionalText, env.LINE_CHANNEL_ACCESS_TOKEN);
	}
}

async function handleDogText(replyToken: string, env: Env): Promise<void> {
	logDebug('Handling dog text request');
	const text = await fetchText(CONFIG.API.DOG_TEXT);
	if (text) {
		const converter = await getConverter();
		const traditionalText = await converter(text);
		await sendReply(replyToken, traditionalText, env.LINE_CHANNEL_ACCESS_TOKEN);
	}
}

async function getCustomHoroscopeForUser(zodiacKey: string): Promise<string> {
	const todayDate = DateUtils.getTodayDate();
	return `今日運勢 ( ${todayDate} ) ${zodiacKey}座
愛情運 ★★★★★★★
今天是個適合做愛的日子。
事業運 ★★★★★★★
今天是個適合做愛的日子。
金錢運 ★★★★★★★
今天是個適合做愛的日子。
健康運 ★★★★★★★
今天是個適合做愛的日子。
幸運數字：69。幸運顏色：精液白`;
}

// Main handler
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

		try {
			logDebug('Processing incoming request');
			const body = (await request.json()) as { events: LineEvent[] };
			logDebug('Request body', { body });

			await Promise.all(
				body.events.map(async (event) => {
					try {
						logDebug('Processing event', { event });
						await handleMessage(event, env, ctx);
						logDebug('Event processed successfully');
					} catch (error) {
						logDebug('Error processing event', { error });
					}
				})
			);

			return new Response('OK', { status: 200 });
		} catch (error) {
			logDebug('Error processing request', { error });
			return new Response('Error', { status: 500 });
		}
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const now = new Date(event.scheduledTime);
		const utc8Hour = (now.getUTCHours() + 8) % 24; // 轉換為 UTC+8

		logDebug('Scheduled event triggered', {
			time: event.scheduledTime,
			utc8Hour,
			type: 'daily',
		});

		// 確保只在 UTC+8 00:00 執行預加載
		if (utc8Hour === 0) {
			logDebug('Starting daily horoscope preload');
			try {
				await preloadAllHoroscopes(env.HOROSCOPE_CACHE);
				logDebug('Daily horoscope preload completed successfully');
			} catch (error) {
				logDebug('Error during daily horoscope preload', { error });
			}
		} else {
			logDebug('Skipping preload - not midnight UTC+8', { utc8Hour });
		}
	},
};
