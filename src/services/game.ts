import { CONFIG } from '../config/constants.js';
import { Env, GameState, RollResponse } from '../types/index.js';
import { logDebug, createGameUrl } from '../utils/common.js';
import { sendReply, sendLineMessages, fetchGroupMemberProfile } from './api.js';

// 遊戲命令處理器
class GameCommandHandler {
	// 處理 roll 指令
	static async handleRollCommand(
		groupId: string,
		userId: string,
		replyToken: string,
		text: string,
		accessToken: string,
		env: Env
	): Promise<void> {
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
			return sendReply(replyToken, '未知的指令格式', accessToken);
		}
	}

	// 處理 !rollnum 指令（建立新遊戲）
	static async handleRollNum(groupId: string, replyToken: string, text: string, accessToken: string, env: Env): Promise<void> {
		logDebug('Processing !rollnum command', { groupId });

		// 檢查是否有進行中的遊戲
		const existingGame = await this.getGameState(groupId, env);
		if (existingGame) {
			logDebug('Active game found when trying to create new game', { groupId });
			await sendReply(replyToken, '還有正在進行中的比大小，先比完好嗎 親 ~~', accessToken);
			return;
		}

		const parts = text.split(' ');
		logDebug('Command parts', { parts });

		// 驗證命令格式
		if (parts.length !== 2) {
			logDebug('Invalid !rollnum format - wrong number of parts');
			await sendReply(replyToken, '請輸入正確格式，例如 !rollnum 3 (2~10人)', accessToken);
			return;
		}

		// 驗證人數參數
		const playerCount = this.validatePlayerCount(parts[1]);
		if (playerCount === null) {
			await sendReply(replyToken, `操妳媽還敢亂搞啊 我內射妳肛門${parts[1]}次`, accessToken);
			return;
		}

		if (playerCount < 2 || playerCount > CONFIG.ROLL.MAX_PLAYERS) {
			logDebug('Invalid player count', { playerCount });
			await sendReply(replyToken, '請輸入正確人數，例如 !rollnum 3 (2~10人)', accessToken);
			return;
		}

		// 建立新遊戲
		await this.createNewGame(groupId, playerCount, replyToken, accessToken, env);
	}

	// 處理 !roll 指令（參與遊戲）
	static async handleRoll(groupId: string, userId: string, replyToken: string, accessToken: string, env: Env): Promise<void> {
		try {
			logDebug('Starting handleRoll', { groupId, userId, replyToken });

			// 檢查遊戲是否存在
			const game = await this.getGameState(groupId, env);
			if (!game) {
				logDebug('No active game found', { groupId });
				await sendReply(replyToken, '還沒有進行中的比大小，請先輸入 !rollnum {人數}，例如 !rollnum 3', accessToken);
				return;
			}

			// 嘗試骰子
			const rollResult = await this.performRoll(groupId, userId, env);
			if (!rollResult.success) {
				await this.handleRollError(rollResult.error!, replyToken, accessToken);
				return;
			}

			// 處理骰子結果
			await this.handleRollResult(rollResult.data!, groupId, replyToken, accessToken, userId);
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

	// 獲取遊戲狀態
	private static async getGameState(groupId: string, env: Env): Promise<GameState | null> {
		const id = env.GAME_STATE.idFromName(groupId);
		const obj = env.GAME_STATE.get(id);

		const resp = await obj.fetch(createGameUrl(groupId, 'get'));
		const responseText = await resp.text();

		return resp.ok && responseText ? (JSON.parse(responseText) as GameState) : null;
	}

	// 驗證玩家數量
	private static validatePlayerCount(input: string): number | null {
		// 檢查是否為純整數（只包含數字）
		if (!/^\d+$/.test(input)) {
			logDebug('Non-integer input detected', { rawInput: input });
			return null;
		}

		const num = parseInt(input);
		logDebug('Parsed player count', { num, rawInput: input });

		return isNaN(num) ? null : num;
	}

	// 建立新遊戲
	private static async createNewGame(
		groupId: string,
		maxPlayers: number,
		replyToken: string,
		accessToken: string,
		env: Env
	): Promise<void> {
		const id = env.GAME_STATE.idFromName(groupId);
		const obj = env.GAME_STATE.get(id);

		const createResp = await obj.fetch(createGameUrl(groupId, 'create', { maxPlayers: maxPlayers.toString() }));
		if (!createResp.ok) {
			logDebug('Failed to create game', { status: createResp.status });
			await sendReply(replyToken, '建立遊戲失敗，請稍後再試', accessToken);
			return;
		}

		logDebug('Created new game', { groupId, maxPlayers });
		await sendReply(replyToken, '請依序輸入 !roll 會自動記錄比對，超過30分鐘沒比完的會自動關閉。', accessToken);
	}

	// 執行骰子
	private static async performRoll(
		groupId: string,
		userId: string,
		env: Env
	): Promise<{ success: boolean; data?: RollResponse; error?: string }> {
		const id = env.GAME_STATE.idFromName(groupId);
		const obj = env.GAME_STATE.get(id);

		const resp = await obj.fetch(createGameUrl(groupId, 'roll', { userId }));
		logDebug('Roll response', { status: resp.status, ok: resp.ok });

		if (!resp.ok) {
			const error = await resp.text();
			logDebug('Roll error response', { error });
			return { success: false, error };
		}

		const responseText = await resp.text();
		const result = JSON.parse(responseText) as RollResponse;
		logDebug('Roll result', {
			groupId,
			userId,
			point: result.point,
			isComplete: result.isComplete,
			players: result.players,
		});

		return { success: true, data: result };
	}

	// 處理骰子錯誤
	private static async handleRollError(error: string, replyToken: string, accessToken: string): Promise<void> {
		const errorMessages: Record<string, string> = {
			'Game is full': '參加人數已滿，無法加入',
			'Already rolled': '你已經骰過了！',
		};

		const message = errorMessages[error] || '骰子失敗，請稍後再試';
		await sendReply(replyToken, message, accessToken);
	}

	// 處理骰子結果
	private static async handleRollResult(
		result: RollResponse,
		groupId: string,
		replyToken: string,
		accessToken: string,
		userId: string
	): Promise<void> {
		// 獲取用戶名稱
		const displayName = await fetchGroupMemberProfile(userId, groupId, accessToken);

		if (result.isComplete) {
			logDebug('Game complete, preparing final results', { groupId, players: result.players });
			await this.sendFinalResults(result, groupId, replyToken, accessToken, displayName);
		} else {
			// 如果遊戲還沒結束，只發送當前玩家的結果
			await sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);
		}
	}

	// 發送最終結果
	private static async sendFinalResults(
		result: RollResponse,
		groupId: string,
		replyToken: string,
		accessToken: string,
		displayName: string
	): Promise<void> {
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
	}
}

// 匯出主要處理函數
export async function handleRollCommand(
	groupId: string,
	userId: string,
	replyToken: string,
	text: string,
	accessToken: string,
	env: Env
): Promise<void> {
	return GameCommandHandler.handleRollCommand(groupId, userId, replyToken, text, accessToken, env);
}
