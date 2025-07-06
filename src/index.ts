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
		RANDOM_IMAGE: 'https://api.btstu.cn/sjbz/api.php?lx=meizi&format=json',
		LINE_REPLY: 'https://api.line.me/v2/bot/message/reply',
		HOROSCOPE: 'https://api.vvhan.com/api/horoscope',
	},
} as const;

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
	code: string;
	imgurl: string;
	width: string;
	height: string;
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
				delete this.games[groupId];
			}

			await this.saveState();
			return new Response(JSON.stringify(response));
		}

		return new Response('Invalid action', { status: 400 });
	}
}

// Roll Game State
const rollGames: Record<
	string,
	{
		players: Record<string, number>;
		maxPlayers: number;
		startedAt: number;
	}
> = {};

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
function stars(n: number): string {
	return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function truncateToFirstPeriod(text: string): string {
	const periodIndex = text.indexOf('。');
	return periodIndex !== -1 ? text.substring(0, periodIndex + 1) : text;
}

function logDebug(message: string, data?: any) {
	console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
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

// API Service
class ApiService {
	static async fetchRandomImage(): Promise<string | null> {
		try {
			logDebug(`Fetching random image from API: ${CONFIG.API.RANDOM_IMAGE}`);
			const response = await fetch(CONFIG.API.RANDOM_IMAGE);
			logDebug(`Random image API response status: ${response.status}`);

			const imageData = (await response.json()) as RandomImageResponse;
			logDebug(`Random image API response data:`, imageData);

			if (imageData.code === '200' && imageData.imgurl) {
				logDebug(`Successfully fetched random image: ${imageData.imgurl}`);
				return imageData.imgurl;
			}

			logDebug(`API returned code: ${imageData.code}`);
			return null;
		} catch (error) {
			logDebug(`Error fetching random image:`, error);
			return null;
		}
	}

	static async sendReply(replyToken: string, text: string, accessToken: string): Promise<void> {
		await fetch(CONFIG.API.LINE_REPLY, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				replyToken,
				messages: [{ type: 'text', text }],
			}),
		});
	}

	static async sendImageReply(replyToken: string, imageUrl: string, accessToken: string): Promise<void> {
		await fetch(CONFIG.API.LINE_REPLY, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				replyToken,
				messages: [
					{
						type: 'image',
						originalContentUrl: imageUrl,
						previewImageUrl: imageUrl,
					},
				],
			}),
		});
	}

	static async fetchUserProfile(userId: string, accessToken: string): Promise<string> {
		try {
			const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				logDebug('Failed to fetch user profile', {
					userId,
					status: response.status,
				});
				return userId;
			}

			const profile = (await response.json()) as { displayName: string };
			return profile.displayName;
		} catch (error) {
			logDebug('Error fetching user profile', {
				userId,
				error,
			});
			return userId;
		}
	}

	static async fetchGroupMemberProfile(userId: string, groupId: string, accessToken: string): Promise<string> {
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
}

// Horoscope Service
class HoroscopeService {
	static async fetchHoroscopeData(zodiacEn: string): Promise<HoroscopeData | null> {
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

	static async getCachedHoroscope(kv: KVNamespace, zodiacKey: string): Promise<CachedHoroscope | null> {
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

	static async cacheHoroscope(kv: KVNamespace, zodiacKey: string, data: HoroscopeData): Promise<void> {
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

	static async preloadAllHoroscopes(kv: KVNamespace): Promise<void> {
		logDebug('Starting horoscope preload');

		const allZodiacs = Object.keys(zodiacMap);
		const uniqueZodiacEns = [...new Set(Object.values(zodiacMap))];

		logDebug('Preloading horoscopes', { uniqueZodiacEns });

		for (const zodiacEn of uniqueZodiacEns) {
			try {
				logDebug('Preloading horoscope', { zodiacEn });
				const data = await this.fetchHoroscopeData(zodiacEn);

				if (data) {
					const zodiacKeys = allZodiacs.filter((key) => zodiacMap[key] === zodiacEn);
					logDebug('Caching horoscope data', { zodiacEn, zodiacKeys });

					for (const key of zodiacKeys) {
						await this.cacheHoroscope(kv, key, data);
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

	static findZodiacMatch(text: string): string | undefined {
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
}

// Roll Game Service
class RollGameService {
	static async handleRollCommand(
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
			return this.handleRollNum(groupId, replyToken, normalizedText, accessToken, env);
		} else if (normalizedText === '!roll') {
			logDebug('Detected !roll command');
			return this.handleRoll(groupId, userId, replyToken, accessToken, env);
		} else {
			logDebug('Unknown roll command format', { text: normalizedText });
			return ApiService.sendReply(replyToken, '未知的指令格式', accessToken);
		}
	}

	private static async handleRollNum(groupId: string, replyToken: string, text: string, accessToken: string, env: Env): Promise<void> {
		logDebug('Processing !rollnum command', { groupId });

		const parts = text.split(' ');
		logDebug('Command parts', { parts });

		if (parts.length !== 2) {
			logDebug('Invalid !rollnum format - wrong number of parts');
			await ApiService.sendReply(replyToken, '請輸入正確格式，例如 !rollnum 3 (2~10人)', accessToken);
			return;
		}

		const num = parseInt(parts[1]);
		logDebug('Parsed player count', { num, rawInput: parts[1] });

		if (isNaN(num) || num < 2 || num > CONFIG.ROLL.MAX_PLAYERS) {
			logDebug('Invalid player count', { num });
			await ApiService.sendReply(replyToken, '請輸入正確人數，例如 !rollnum 3 (2~10人)', accessToken);
			return;
		}

		const id = env.GAME_STATE.idFromName(groupId);
		const obj = env.GAME_STATE.get(id);
		const url = new URL('https://dummy-url');
		url.searchParams.set('groupId', groupId);
		url.searchParams.set('action', 'create');
		url.searchParams.set('maxPlayers', num.toString());

		const resp = await obj.fetch(url);
		if (!resp.ok) {
			logDebug('Failed to create game', { status: resp.status });
			await ApiService.sendReply(replyToken, '建立遊戲失敗，請稍後再試', accessToken);
			return;
		}

		logDebug('Created new game', { groupId, maxPlayers: num });
		await ApiService.sendReply(replyToken, '請依序輸入 !roll 會自動記錄比對，超過30分鐘沒比完的會自動關閉。', accessToken);
	}

	private static async handleRoll(groupId: string, userId: string, replyToken: string, accessToken: string, env: Env): Promise<void> {
		try {
			logDebug('Starting handleRoll', {
				groupId,
				userId,
				replyToken,
			});

			const id = env.GAME_STATE.idFromName(groupId);
			const obj = env.GAME_STATE.get(id);

			// First check if game exists
			const getUrl = new URL('https://dummy-url');
			getUrl.searchParams.set('groupId', groupId);
			getUrl.searchParams.set('action', 'get');

			let resp = await obj.fetch(getUrl);
			logDebug('Get game response', {
				status: resp.status,
				ok: resp.ok,
			});

			let responseText = await resp.text();
			logDebug('Get game response text', { responseText });

			const game = resp.ok && responseText ? (JSON.parse(responseText) as GameState) : null;
			logDebug('Parsed game state', { game });

			if (!game) {
				logDebug('No active game found', { groupId });
				await ApiService.sendReply(replyToken, '還沒有進行中的比大小，請先輸入 !rollnum {人數}，例如 !rollnum 3', accessToken);
				return;
			}

			// Try to roll
			const rollUrl = new URL('https://dummy-url');
			rollUrl.searchParams.set('groupId', groupId);
			rollUrl.searchParams.set('action', 'roll');
			rollUrl.searchParams.set('userId', userId);

			logDebug('Sending roll request', {
				url: rollUrl.toString(),
				params: {
					groupId,
					action: 'roll',
					userId,
				},
			});

			resp = await obj.fetch(rollUrl);
			logDebug('Roll response', {
				status: resp.status,
				ok: resp.ok,
			});

			if (!resp.ok) {
				const error = await resp.text();
				logDebug('Roll error response', { error });

				if (error === 'Game is full') {
					await ApiService.sendReply(replyToken, '參加人數已滿，無法加入', accessToken);
				} else if (error === 'Already rolled') {
					await ApiService.sendReply(replyToken, '你已經骰過了！', accessToken);
				} else {
					await ApiService.sendReply(replyToken, '骰子失敗，請稍後再試', accessToken);
				}
				return;
			}

			responseText = await resp.text();
			logDebug('Roll response text', { responseText });

			const result = JSON.parse(responseText) as RollResponse;
			logDebug('Roll result', {
				groupId,
				userId,
				point: result.point,
				isComplete: result.isComplete,
				players: result.players,
			});

			// 獲取用戶名稱
			const displayName = await ApiService.fetchGroupMemberProfile(userId, groupId, accessToken);

			// 先發送當前玩家的骰子結果
			await ApiService.sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);

			if (result.isComplete) {
				logDebug('Game complete, sending final results', {
					groupId,
					players: result.players,
				});

				// 獲取所有玩家的名稱
				const playerNames = await Promise.all(
					Object.keys(result.players).map((id) => ApiService.fetchGroupMemberProfile(id, groupId, accessToken))
				);

				const playerMap = Object.fromEntries(Object.keys(result.players).map((id, index) => [id, playerNames[index]]));

				const results = Object.entries(result.players)
					.map(([id, score]) => `${playerMap[id]} : ${score} 點`)
					.join('\n');

				const winner = Object.entries(result.players).sort((a, b) => b[1] - a[1])[0][0];

				// 使用 LINE Messaging API 的 push message 來發送最終結果
				await fetch('https://api.line.me/v2/bot/message/push', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({
						to: groupId,
						messages: [
							{
								type: 'text',
								text: `${results}\n獲勝者為 : ${playerMap[winner]}`,
							},
						],
					}),
				});
			}
		} catch (error) {
			logDebug('Error in handleRoll', {
				error,
				errorMessage: error instanceof Error ? error.message : 'Unknown error',
				errorStack: error instanceof Error ? error.stack : undefined,
				groupId,
				userId,
			});
			await ApiService.sendReply(replyToken, '處理命令時發生錯誤', accessToken);
		}
	}
}

// Message Handler Service
class MessageHandlerService {
	private readonly env: Env;
	private converter: Promise<(text: string) => Promise<string>> | null = null;

	constructor(env: Env) {
		this.env = env;
	}

	private async getConverter(): Promise<(text: string) => Promise<string>> {
		if (!this.converter) {
			this.converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
		}
		return this.converter;
	}

	async handleMessage(event: LineEvent, ctx: ExecutionContext): Promise<void> {
		try {
			logDebug('Starting message processing', { event });

			if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) {
				logDebug('Invalid message type or missing replyToken', { type: event.type, messageType: event.message?.type });
				return;
			}

			const text = event.message.text.trim();
			logDebug('Processing message', { text });

			// 先檢查是否為命令
			const isCmd = this.isCommand(text);
			logDebug('Command check result', { text, isCommand: isCmd });

			if (isCmd) {
				logDebug('Handling command', { text });
				await this.handleCommand(event, ctx);
				return;
			}

			logDebug('Processing as normal message', { text });
			// 處理一般文本
			await this.handleNormalMessage(text, event.replyToken, ctx);
		} catch (error) {
			logDebug('Error in handleMessage', { error });
		}
	}

	private isCommand(text: string): boolean {
		// 先將全形符號轉換為半形符號
		const normalizedText = text.replace(/[！]/g, '!');

		const isRoll = normalizedText === '!roll';
		const isRollNum = normalizedText.startsWith('!rollnum');
		const isDraw = normalizedText === '抽';
		const result = isRoll || isRollNum || isDraw;

		logDebug('Command detection', {
			originalText: text,
			normalizedText,
			isRoll,
			isRollNum,
			isDraw,
			result,
		});

		return result;
	}

	private async handleCommand(event: LineEvent, ctx: ExecutionContext): Promise<void> {
		const text = event.message!.text.trim();
		logDebug('Starting command handling', { text });

		// 處理遊戲命令
		if (text === '!roll' || text.startsWith('!rollnum')) {
			logDebug('Detected game command', { text });
			await this.handleGameCommand(event, ctx);
			return;
		}

		// 處理「抽」命令
		if (text === '抽') {
			logDebug('Detected draw command');
			await this.handleRandomImage(event.replyToken!);
			return;
		}

		logDebug('No matching command handler found', { text });
	}

	private async handleGameCommand(event: LineEvent, ctx: ExecutionContext): Promise<void> {
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
			await ApiService.sendReply(event.replyToken!, '此命令只能在群組中使用', this.env.LINE_CHANNEL_ACCESS_TOKEN);
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

			await RollGameService.handleRollCommand(
				event.source.groupId,
				event.source.userId,
				event.replyToken!,
				text,
				this.env.LINE_CHANNEL_ACCESS_TOKEN,
				this.env
			);
			logDebug('Game command processed successfully');
		} catch (error) {
			logDebug('Error processing game command', { error });
			await ApiService.sendReply(event.replyToken!, '處理命令時發生錯誤', this.env.LINE_CHANNEL_ACCESS_TOKEN);
		}
	}

	private async handleNormalMessage(text: string, replyToken: string, ctx: ExecutionContext): Promise<void> {
		try {
			// 檢查星座匹配
			const match = HoroscopeService.findZodiacMatch(text);
			if (match) {
				logDebug('Found zodiac match', { match });
				await this.handleHoroscope(match, replyToken, ctx);
			}
		} catch (error) {
			logDebug('Error handling normal message', { error });
		}
	}

	private async handleRandomImage(replyToken: string): Promise<void> {
		logDebug('Handling random image request');
		const imageUrl = await ApiService.fetchRandomImage();
		if (imageUrl) {
			await ApiService.sendImageReply(replyToken, imageUrl, this.env.LINE_CHANNEL_ACCESS_TOKEN);
		}
	}

	private async handleHoroscope(zodiacKey: string, replyToken: string, ctx: ExecutionContext): Promise<void> {
		let data: HoroscopeData | null = null;
		const cachedData = await HoroscopeService.getCachedHoroscope(this.env.HOROSCOPE_CACHE, zodiacKey);

		if (cachedData) {
			logDebug('Using cached horoscope data', { zodiacKey });
			data = cachedData.data;
		} else {
			// 快取未命中時，直接獲取單個星座的資料
			logDebug('Cache miss, fetching individual horoscope', { zodiacKey });
			const zodiacEn = zodiacMap[zodiacKey];
			data = await HoroscopeService.fetchHoroscopeData(zodiacEn);

			if (data) {
				await HoroscopeService.cacheHoroscope(this.env.HOROSCOPE_CACHE, zodiacKey, data);
				// 在背景預加載其他星座資料
				ctx.waitUntil(HoroscopeService.preloadAllHoroscopes(this.env.HOROSCOPE_CACHE));
			}
		}

		if (!data) {
			logDebug('No horoscope data available', { zodiacKey });
			return;
		}

		const replyText = await this.formatHoroscopeReply(data, zodiacKey);
		await ApiService.sendReply(replyToken, replyText, this.env.LINE_CHANNEL_ACCESS_TOKEN);
	}

	private async formatHoroscopeReply(data: HoroscopeData, zodiacKey: string): Promise<string> {
		const converter = await this.getConverter();
		const loveText = truncateToFirstPeriod(await converter(data.fortunetext.love));
		const workText = truncateToFirstPeriod(await converter(data.fortunetext.work));
		const moneyText = truncateToFirstPeriod(await converter(data.fortunetext.money));
		const healthText = truncateToFirstPeriod(await converter(data.fortunetext.health));
		const luckyColor = await converter(data.luckycolor);

		const loveStars = stars(data.fortune.love);
		const workStars = stars(data.fortune.work);
		const moneyStars = stars(data.fortune.money);
		const healthStars = stars(data.fortune.health);
		const todayDate = DateUtils.getTodayDate();

		return `今日運勢 ( ${todayDate} ) ${zodiacKey}座
愛情運 ${loveStars}
${loveText}
事業運 ${workStars}
${workText}
金錢運 ${moneyStars}
${moneyText}
健康運 ${healthStars}
${healthText}
幸運數字 : ${data.luckynumber}。幸運顏色 : ${luckyColor}`;
	}
}

// Main handler
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 手動預載端點
		if (url.pathname === '/preload' && request.method === 'GET') {
			logDebug('Manual preload triggered');
			await HoroscopeService.preloadAllHoroscopes(env.HOROSCOPE_CACHE);
			return new Response('Preload completed', { status: 200 });
		}

		if (request.method !== 'POST') {
			return new Response('OK', { status: 200 });
		}

		try {
			logDebug('Processing incoming request');
			const body = (await request.json()) as { events: LineEvent[] };
			logDebug('Request body', { body });

			const messageHandler = new MessageHandlerService(env);

			await Promise.all(
				body.events.map(async (event) => {
					try {
						logDebug('Processing event', { event });
						await messageHandler.handleMessage(event, ctx);
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
				await HoroscopeService.preloadAllHoroscopes(env.HOROSCOPE_CACHE);
				logDebug('Daily horoscope preload completed successfully');
			} catch (error) {
				logDebug('Error during daily horoscope preload', { error });
			}
		} else {
			logDebug('Skipping preload - not midnight UTC+8', { utc8Hour });
		}
	},
};
