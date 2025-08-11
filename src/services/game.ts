import { CONFIG } from '../config/constants.js';
import { Env, GameState, RollResponse } from '../types/index.js';
import { createGameUrl } from '../utils/common.js';
import { sendReply, sendLineMessages, fetchGroupMemberProfile } from './api.js';

// 處理 roll 指令
const handleRollCommand = async (
	groupId: string,
	userId: string,
	replyToken: string,
	text: string,
	accessToken: string,
	env: Env
): Promise<void> => {
	const normalizedText = text.replace(/[！]/g, '!');

	if (normalizedText.startsWith('!rollnum')) {
		return handleRollNum(groupId, replyToken, normalizedText, accessToken, env);
	} else if (normalizedText === '!roll') {
		return handleRoll(groupId, userId, replyToken, accessToken, env);
	} else {
		return sendReply(replyToken, '未知的指令格式', accessToken);
	}
};

// 處理 !rollnum 指令（建立新遊戲）
const handleRollNum = async (groupId: string, replyToken: string, text: string, accessToken: string, env: Env): Promise<void> => {
	// 檢查是否有進行中的遊戲
	const existingGame = await getGameState(groupId, env);
	if (existingGame) {
		await sendReply(replyToken, '還有正在進行中的比大小，先比完好嗎 親 ~~', accessToken);
		return;
	}

	// 支援多個空白或 tab 的彈性分割
	const parts = text.trim().split(/\s+/);

	// 驗證命令格式
	if (parts.length !== 2) {
		await sendReply(replyToken, '請輸入正確格式，例如 !rollnum 3 (2~10人)', accessToken);
		return;
	}

	// 驗證人數參數
	const playerCount = validatePlayerCount(parts[1]);
	if (playerCount === null) {
		await sendReply(replyToken, `操妳媽還敢亂搞啊 我內射妳肛門${parts[1]}次`, accessToken);
		return;
	}

	if (playerCount < 2 || playerCount > CONFIG.ROLL.MAX_PLAYERS) {
		await sendReply(replyToken, '請輸入正確人數，例如 !rollnum 3 (2~10人)', accessToken);
		return;
	}

	// 建立新遊戲
	await createNewGame(groupId, playerCount, replyToken, accessToken, env);
};

// 處理 !roll 指令（參與遊戲）
const handleRoll = async (groupId: string, userId: string, replyToken: string, accessToken: string, env: Env): Promise<void> => {
	try {
		// 檢查遊戲是否存在
		const game = await getGameState(groupId, env);
		if (!game) {
			await sendReply(replyToken, '還沒有進行中的比大小，請先輸入 !rollnum {人數}，例如 !rollnum 3', accessToken);
			return;
		}

		// 嘗試骰子
		const rollResult = await performRoll(groupId, userId, env);
		if (!rollResult.success) {
			await handleRollError(rollResult.error!, replyToken, accessToken);
			return;
		}

		// 處理骰子結果
		await handleRollResult(rollResult.data!, groupId, replyToken, accessToken, userId);
	} catch (error) {
		await sendReply(replyToken, '處理命令時發生錯誤', accessToken);
	}
};

// 獲取遊戲狀態
const getGameState = async (groupId: string, env: Env): Promise<GameState | null> => {
	const id = env.GAME_STATE.idFromName(groupId);
	const obj = env.GAME_STATE.get(id);

	const resp = await obj.fetch(createGameUrl(groupId, 'get'));
	const responseText = await resp.text();

	return resp.ok && responseText ? (JSON.parse(responseText) as GameState) : null;
};

// 驗證玩家數量
const validatePlayerCount = (input: string): number | null => {
	// 檢查是否為純整數（只包含數字）
	if (!/^\d+$/.test(input)) {
		return null;
	}

	const num = parseInt(input);

	return isNaN(num) ? null : num;
};

// 建立新遊戲
const createNewGame = async (groupId: string, maxPlayers: number, replyToken: string, accessToken: string, env: Env): Promise<void> => {
	const id = env.GAME_STATE.idFromName(groupId);
	const obj = env.GAME_STATE.get(id);

	const createResp = await obj.fetch(createGameUrl(groupId, 'create', { maxPlayers: maxPlayers.toString() }));
	if (!createResp.ok) {
		await sendReply(replyToken, '建立遊戲失敗，請稍後再試', accessToken);
		return;
	}

	await sendReply(replyToken, '請依序輸入 !roll 會自動記錄比對，超過30分鐘沒比完的會自動關閉。', accessToken);
};

// 執行骰子
const performRoll = async (
	groupId: string,
	userId: string,
	env: Env
): Promise<{ success: boolean; data?: RollResponse; error?: string }> => {
	const id = env.GAME_STATE.idFromName(groupId);
	const obj = env.GAME_STATE.get(id);

	const resp = await obj.fetch(createGameUrl(groupId, 'roll', { userId }));

	if (!resp.ok) {
		const error = await resp.text();
		return { success: false, error };
	}

	const responseText = await resp.text();
	const result = JSON.parse(responseText) as RollResponse;

	return { success: true, data: result };
};

// 處理骰子錯誤
const handleRollError = async (error: string, replyToken: string, accessToken: string): Promise<void> => {
	const errorMessages: Record<string, string> = {
		'Game is full': '參加人數已滿，無法加入',
		'Already rolled': '你已經骰過了！',
	};

	const message = errorMessages[error] || '骰子失敗，請稍後再試';
	await sendReply(replyToken, message, accessToken);
};

// 處理骰子結果
const handleRollResult = async (
	result: RollResponse,
	groupId: string,
	replyToken: string,
	accessToken: string,
	userId: string
): Promise<void> => {
	// 獲取用戶名稱
	const displayName = await fetchGroupMemberProfile(userId, groupId, accessToken);

	if (result.isComplete) {
		await sendFinalResults(result, groupId, replyToken, accessToken, displayName);
	} else {
		// 如果遊戲還沒結束，只發送當前玩家的結果
		await sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);
	}
};

// 發送最終結果
const sendFinalResults = async (
	result: RollResponse,
	groupId: string,
	replyToken: string,
	accessToken: string,
	displayName: string
): Promise<void> => {
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
	} catch (error) {
		// 如果發送完整結果失敗，至少發送當前玩家的結果
		await sendReply(replyToken, `${displayName}骰出 : ${result.point} 點`, accessToken);
	}
};

// 匯出主要處理函數
export { handleRollCommand };
