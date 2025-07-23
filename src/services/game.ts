import { CONFIG } from '../config/constants.js';
import { Env, GameState, RollResponse } from '../types/index.js';
import { logDebug, createGameUrl } from '../utils/common.js';
import { sendReply, sendLineMessages, fetchGroupMemberProfile } from './api.js';

// 處理 roll 指令
export async function handleRollCommand(
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

// 處理 !rollnum 指令（建立新遊戲）
export async function handleRollNum(groupId: string, replyToken: string, text: string, accessToken: string, env: Env): Promise<void> {
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

// 處理 !roll 指令（參與遊戲）
export async function handleRoll(groupId: string, userId: string, replyToken: string, accessToken: string, env: Env): Promise<void> {
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
