import { GameState } from '../types/index.js';
import { CONFIG } from '../config/constants.js';

// 檢查遊戲是否過期
const isGameExpired = (game: GameState): boolean => {
	return Date.now() - game.startedAt > CONFIG.ROLL.TIMEOUT;
};

// 檢查遊戲是否已滿
const isGameFull = (game: GameState): boolean => {
	return Object.keys(game.players).length >= game.maxPlayers;
};

// 檢查玩家是否已經骰過
const hasPlayerRolled = (game: GameState, userId: string): boolean => {
	return game.players[userId] !== undefined;
};

// 生成隨機點數
const generateRandomPoint = (): number => {
	return Math.floor(Math.random() * 100) + 1;
};

// 建立新遊戲
const createGame = (games: Record<string, GameState>, groupId: string, maxPlayers: number): GameState => {
	const game: GameState = {
		players: {},
		maxPlayers,
		startedAt: Date.now(),
	};

	games[groupId] = game;

	return game;
};

// 獲取遊戲狀態
const getGame = (games: Record<string, GameState>, groupId: string): GameState | null => {
	const game = games[groupId];

	if (!game || isGameExpired(game)) {
		if (game) {
			delete games[groupId];
		}
		return null;
	}

	return game;
};

// 執行骰子
const rollDice = (games: Record<string, GameState>, groupId: string, userId: string): { success: boolean; data?: any; error?: string } => {
	const game = games[groupId];

	if (!game || isGameExpired(game)) {
		delete games[groupId];
		return { success: false, error: 'Game not found or expired' };
	}

	if (isGameFull(game)) {
		return { success: false, error: 'Game is full' };
	}

	if (hasPlayerRolled(game, userId)) {
		return { success: false, error: 'Already rolled' };
	}

	const point = generateRandomPoint();
	game.players[userId] = point;

	const newPlayerCount = Object.keys(game.players).length;
	const isComplete = newPlayerCount === game.maxPlayers;

	const response = {
		point,
		isComplete,
		players: game.players,
	};

	if (isComplete) {
		delete games[groupId];
	}

	return { success: true, data: response };
};

// 遊戲狀態 Durable Object（需為可被 new 的類別）
// 不使用 class，改用可被 new 的函式（建構式函式）實作 Durable Object
export function GameStateObject(state: DurableObjectState) {
	let games: Record<string, GameState> = {};

	// 初始化時從 storage 讀取遊戲狀態
	const initializeState = async (): Promise<void> => {
		const stored = (await state.storage.get('games')) as Record<string, GameState>;
		if (stored) {
			games = stored;
			// 清理過期的遊戲
			for (const [groupId, game] of Object.entries(games)) {
				if (isGameExpired(game)) {
					delete games[groupId];
				}
			}
			await saveState();
		}
	};

	// 儲存遊戲狀態
	const saveState = async (): Promise<void> => {
		await state.storage.put('games', games);
	};

	// 處理建立遊戲的請求
	const handleCreateAction = async (groupId: string, url: URL): Promise<Response> => {
		const maxPlayers = parseInt(url.searchParams.get('maxPlayers') || '0');
		if (maxPlayers < 2 || maxPlayers > CONFIG.ROLL.MAX_PLAYERS) {
			return new Response('Invalid maxPlayers', { status: 400 });
		}

		const game = createGame(games, groupId, maxPlayers);
		await saveState();
		return new Response(JSON.stringify(game));
	};

	// 處理獲取遊戲狀態的請求
	const handleGetAction = async (groupId: string): Promise<Response> => {
		const game = getGame(games, groupId);
		await saveState();
		return new Response(game ? JSON.stringify(game) : null);
	};

	// 處理骰子請求
	const handleRollAction = async (groupId: string, url: URL): Promise<Response> => {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return new Response('Missing userId', { status: 400 });
		}

		const result = rollDice(games, groupId, userId);
		await saveState();

		if (result.success) {
			return new Response(JSON.stringify(result.data));
		} else {
			return new Response(result.error, { status: 400 });
		}
	};

	// 主 fetch 函數
	const fetch = async (request: Request): Promise<Response> => {
		await initializeState(); // 每次請求時確保狀態是最新的

		const url = new URL(request.url);
		const groupId = url.searchParams.get('groupId');
		if (!groupId) {
			return new Response('Missing groupId', { status: 400 });
		}

		const action = url.searchParams.get('action');

		try {
			switch (action) {
				case 'create':
					return await handleCreateAction(groupId, url);
				case 'get':
					return await handleGetAction(groupId);
				case 'roll':
					return await handleRollAction(groupId, url);
				default:
					return new Response('Invalid action', { status: 400 });
			}
		} catch (error) {
			return new Response('Internal server error', { status: 500 });
		}
	};

	// 以物件形式回傳 fetch，讓 new GameStateObject(...) 可得到實例
	return { fetch };
}
