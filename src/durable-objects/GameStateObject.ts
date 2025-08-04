import { GameState } from '../types/index.js';
import { CONFIG } from '../config/constants.js';
import { logDebug } from '../utils/common.js';

// 檢查遊戲是否過期
function isGameExpired(game: GameState): boolean {
	return Date.now() - game.startedAt > CONFIG.ROLL.TIMEOUT;
}

// 檢查遊戲是否已滿
function isGameFull(game: GameState): boolean {
	return Object.keys(game.players).length >= game.maxPlayers;
}

// 檢查玩家是否已經骰過
function hasPlayerRolled(game: GameState, userId: string): boolean {
	return game.players[userId] !== undefined;
}

// 生成隨機點數
function generateRandomPoint(): number {
	return Math.floor(Math.random() * 100) + 1;
}

// 建立新遊戲
function createGame(games: Record<string, GameState>, groupId: string, maxPlayers: number): GameState {
	const game: GameState = {
		players: {},
		maxPlayers,
		startedAt: Date.now(),
	};

	games[groupId] = game;
	logDebug('DO: Created new game', {
		groupId,
		maxPlayers,
		game,
	});

	return game;
}

// 獲取遊戲狀態
function getGame(games: Record<string, GameState>, groupId: string): GameState | null {
	const game = games[groupId];

	if (!game || isGameExpired(game)) {
		if (game) {
			delete games[groupId];
		}
		logDebug('DO: Game not found or expired', {
			groupId,
			hasGame: !!game,
			timeElapsed: game ? Date.now() - game.startedAt : null,
		});
		return null;
	}

	logDebug('DO: Retrieved game', {
		groupId,
		game,
	});

	return game;
}

// 執行骰子
function rollDice(games: Record<string, GameState>, groupId: string, userId: string): { success: boolean; data?: any; error?: string } {
	const game = games[groupId];

	if (!game || isGameExpired(game)) {
		delete games[groupId];
		logDebug('DO: Game not found or expired during roll', {
			groupId,
			hasGame: !!game,
			timeElapsed: game ? Date.now() - game.startedAt : null,
		});
		return { success: false, error: 'Game not found or expired' };
	}

	const currentPlayerCount = Object.keys(game.players).length;
	logDebug('DO: Current game state before roll', {
		groupId,
		userId,
		currentPlayerCount,
		maxPlayers: game.maxPlayers,
		players: game.players,
	});

	if (isGameFull(game)) {
		logDebug('DO: Game is full', {
			groupId,
			currentPlayerCount,
			maxPlayers: game.maxPlayers,
		});
		return { success: false, error: 'Game is full' };
	}

	if (hasPlayerRolled(game, userId)) {
		logDebug('DO: User already rolled', {
			groupId,
			userId,
			existingRoll: game.players[userId],
		});
		return { success: false, error: 'Already rolled' };
	}

	const point = generateRandomPoint();
	game.players[userId] = point;

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
		delete games[groupId];
	}

	return { success: true, data: response };
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
				if (isGameExpired(game)) {
					delete this.games[groupId];
				}
			}
			await this.saveState();
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

		try {
			switch (action) {
				case 'create':
					return await this.handleCreateAction(groupId, url);
				case 'get':
					return await this.handleGetAction(groupId);
				case 'roll':
					return await this.handleRollAction(groupId, url);
				default:
					return new Response('Invalid action', { status: 400 });
			}
		} catch (error) {
			logDebug('DO: Error handling request', { action, groupId, error });
			return new Response('Internal server error', { status: 500 });
		}
	}

	private async handleCreateAction(groupId: string, url: URL): Promise<Response> {
		const maxPlayers = parseInt(url.searchParams.get('maxPlayers') || '0');
		if (maxPlayers < 2 || maxPlayers > CONFIG.ROLL.MAX_PLAYERS) {
			return new Response('Invalid maxPlayers', { status: 400 });
		}

		const game = createGame(this.games, groupId, maxPlayers);
		await this.saveState();
		return new Response(JSON.stringify(game));
	}

	private async handleGetAction(groupId: string): Promise<Response> {
		const game = getGame(this.games, groupId);
		await this.saveState();
		return new Response(game ? JSON.stringify(game) : null);
	}

	private async handleRollAction(groupId: string, url: URL): Promise<Response> {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return new Response('Missing userId', { status: 400 });
		}

		const result = rollDice(this.games, groupId, userId);
		await this.saveState();

		if (result.success) {
			return new Response(JSON.stringify(result.data));
		} else {
			return new Response(result.error, { status: 400 });
		}
	}
}
