import { GameState } from '../types/index.js';
import { CONFIG } from '../config/constants.js';
import { logDebug } from '../utils/common.js';

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
