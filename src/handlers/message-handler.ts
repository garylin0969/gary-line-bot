import { LineEvent, Env } from '../types/index.js';
import { KEY_WORDS_REPLY, CONFIG } from '../config/constants.js';
import { sendReply, sendImageReply } from '../services/api.js';
import {
	findZodiacMatch,
	getCachedHoroscope,
	fetchHoroscopeData,
	cacheHoroscope,
	formatHoroscopeReply,
	getCustomHoroscopeForUser,
	preloadAllHoroscopes,
} from '../services/horoscope.js';
import { getRandomCopywritingText } from '../services/copywriting.js';
import { handleRollCommand } from '../services/game.js';
import { zodiacMap } from '../config/constants.js';

// 命令類型枚舉
enum CommandType {
	ROLL = 'roll',
	ROLL_NUM = 'rollnum',
	DRAW = 'draw',
	BLACK_SILK = 'black_silk',
	WHITE_SILK = 'white_silk',
	NSFW = 'nsfw',
	LOVE_COPYWRITING = 'love_copywriting',
	FUNNY_COPYWRITING = 'funny_copywriting',
	ROMANTIC_COPYWRITING = 'romantic_copywriting',
	GAY = 'gay',
	CAT = 'cat',
	KEYWORDS = 'keywords',
}

// 命令檢測結果
interface CommandDetection {
	type: CommandType;
	text: string;
	normalizedText: string;
}

// 主要訊息處理函數
export const handleMessage = async (event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> => {
	try {
		if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) {
			return;
		}

		const text = event.message.text.trim();
		const userId = event.source?.userId;

		console.log(`userId: ${userId}`);
		console.log(`text: ${text}`);

		// 檢查是否為命令
		const command = detectCommand(text);
		if (command) {
			await handleCommand(event, command, env, ctx);
			return;
		}

		// 處理一般文本
		await handleNormalMessage(text, event.replyToken, event.source?.userId || '', env, ctx);
	} catch (error) {
		// 錯誤處理
	}
};

// 檢測命令類型
const detectCommand = (text: string): CommandDetection | null => {
	const normalizedText = text?.replace(/[！]/g, '!')?.toLowerCase();

	// 遊戲命令
	if (normalizedText === '!roll') {
		return { type: CommandType.ROLL, text, normalizedText };
	}
	if (normalizedText.startsWith('!rollnum')) {
		return { type: CommandType.ROLL_NUM, text, normalizedText };
	}

	// 圖片命令
	if (text === '抽') {
		return { type: CommandType.DRAW, text, normalizedText };
	}
	if (normalizedText === '!黑絲') {
		return { type: CommandType.BLACK_SILK, text, normalizedText };
	}
	if (normalizedText === '!白絲') {
		return { type: CommandType.WHITE_SILK, text, normalizedText };
	}
	if (text === '色色') {
		return { type: CommandType.NSFW, text, normalizedText };
	}

	// 文案命令
	if (normalizedText === '!情話') {
		return { type: CommandType.LOVE_COPYWRITING, text, normalizedText };
	}
	if (normalizedText === '!幹話') {
		return { type: CommandType.FUNNY_COPYWRITING, text, normalizedText };
	}
	if (normalizedText === '!騷話') {
		return { type: CommandType.ROMANTIC_COPYWRITING, text, normalizedText };
	}

	// 貓咪命令
	if (normalizedText === '!貓') {
		return { type: CommandType.CAT, text, normalizedText };
	}

	// Gay命令
	if (isGayCommand(normalizedText)) {
		return { type: CommandType.GAY, text, normalizedText };
	}

	// 關鍵字命令
	if (hasKeywordMatch(text)) {
		return { type: CommandType.KEYWORDS, text, normalizedText };
	}

	return null;
};

// 檢查是否為甲相關命令
const isGayCommand = (normalizedText: string): boolean => {
	const gayCommands = ['!gay', '!Gay', 'gay', 'Gay', '!甲', '甲', '!甲圖', '甲圖'];
	return gayCommands.includes(normalizedText);
};

// 檢查關鍵字匹配
const hasKeywordMatch = (text: string): boolean => {
	return Object.keys(KEY_WORDS_REPLY).some((key) => text.includes(key));
};

// 處理命令
const handleCommand = async (event: LineEvent, command: CommandDetection, env: Env, ctx: ExecutionContext): Promise<void> => {
	const { type, text, normalizedText } = command;

	try {
		switch (type) {
			case CommandType.ROLL:
			case CommandType.ROLL_NUM:
				await handleGameCommand(event, env, ctx);
				break;

			case CommandType.DRAW:
				await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_GIRL_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
				break;

			case CommandType.BLACK_SILK:
				await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_BLACK_SILK_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
				break;

			case CommandType.WHITE_SILK:
				await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_WHITE_SILK_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
				break;

			case CommandType.NSFW:
				await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_PORN_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
				break;

			case CommandType.LOVE_COPYWRITING:
				await handleCopywritingCommand(event.replyToken!, CONFIG.API.LOVE_COPYWRITING_TEXT, 'love_copywriting', env);
				break;

			case CommandType.FUNNY_COPYWRITING:
				await handleCopywritingCommand(event.replyToken!, CONFIG.API.FUNNY_COPYWRITING_TEXT, 'funny_copywriting', env);
				break;

			case CommandType.ROMANTIC_COPYWRITING:
				await handleCopywritingCommand(event.replyToken!, CONFIG.API.ROMANTIC_COPYWRITING_TEXT, 'romantic_copywriting', env);
				break;

			case CommandType.GAY:
				await handleGay(event.replyToken!, env);
				break;

			case CommandType.CAT:
				await sendImageReply(event.replyToken!, CONFIG.API.CAT_RANDOM_IMAGE + '?random=' + Math.random(), env.LINE_CHANNEL_ACCESS_TOKEN);
				break;

			case CommandType.KEYWORDS:
				await handleKeywordsCommand(event.replyToken!, text, env);
				break;

			default:
				break;
		}
	} catch (error) {
		await sendReply(event.replyToken!, '處理命令時發生錯誤', env.LINE_CHANNEL_ACCESS_TOKEN);
	}
};

// 處理文案命令
const handleCopywritingCommand = async (replyToken: string, apiUrl: string, cacheKey: string, env: Env): Promise<void> => {
	const copywritingText = await getRandomCopywritingText(apiUrl, cacheKey, env.COPYWRITING_CACHE);
	if (copywritingText) {
		await sendReply(replyToken, copywritingText, env.LINE_CHANNEL_ACCESS_TOKEN);
	}
};

// 處理關鍵字命令
const handleKeywordsCommand = async (replyToken: string, text: string, env: Env): Promise<void> => {
	const matchedKey = Object.keys(KEY_WORDS_REPLY).find((key) => text === key);
	if (matchedKey) {
		await sendReply(replyToken, KEY_WORDS_REPLY[matchedKey as keyof typeof KEY_WORDS_REPLY], env.LINE_CHANNEL_ACCESS_TOKEN);
	}
};

// 處理遊戲命令
const handleGameCommand = async (event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> => {
	if (!event.source?.groupId || !event.source?.userId) {
		await sendReply(event.replyToken!, '此命令只能在群組中使用', env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	try {
		const text = event.message!.text.trim();

		await handleRollCommand(event.source.groupId, event.source.userId, event.replyToken!, text, env.LINE_CHANNEL_ACCESS_TOKEN, env);
	} catch (error) {
		await sendReply(event.replyToken!, '處理命令時發生錯誤', env.LINE_CHANNEL_ACCESS_TOKEN);
	}
};

// 處理一般訊息
const handleNormalMessage = async (text: string, replyToken: string, userId: string, env: Env, ctx: ExecutionContext): Promise<void> => {
	try {
		// 檢查星座匹配
		const match = findZodiacMatch(text);
		if (match) {
			await handleHoroscope(match, replyToken, userId, env, ctx);
		}
	} catch (error) {
		// 錯誤處理
	}
};

// 處理占星
const handleHoroscope = async (zodiacKey: string, replyToken: string, userId: string, env: Env, ctx: ExecutionContext): Promise<void> => {
	// 檢查是否為許雲藏的訊息
	if (userId === 'U10e6659922346d74db502c05e908bc55') {
		const customMessage = await getCustomHoroscopeForUser(zodiacKey);
		await sendReply(replyToken, customMessage, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	let data = null;
	const cachedData = await getCachedHoroscope(env.HOROSCOPE_CACHE, zodiacKey);

	if (cachedData) {
		data = cachedData.data;
	} else {
		// 快取未命中時，直接獲取單個星座的資料
		const zodiacEn = zodiacMap[zodiacKey];
		data = await fetchHoroscopeData(zodiacEn);

		if (data) {
			await cacheHoroscope(env.HOROSCOPE_CACHE, zodiacKey, data);
			// 在背景預加載其他星座資料
			ctx.waitUntil(preloadAllHoroscopes(env.HOROSCOPE_CACHE));
		}
	}

	if (!data) {
		return;
	}

	const replyText = await formatHoroscopeReply(data, zodiacKey);
	await sendReply(replyToken, replyText, env.LINE_CHANNEL_ACCESS_TOKEN);
};

// 處理甲圖
const handleGay = async (replyToken: string, env: Env): Promise<void> => {
	try {
		// 隨機選擇 1-35 之間的數字
		const randomNumber = Math.floor(Math.random() * 35) + 1;

		// 構建圖片 URL
		const imageUrl = `https://garylin0969.github.io/json-gather/data/images/gay/gay${randomNumber}.jpg`;

		await sendImageReply(replyToken, imageUrl, env.LINE_CHANNEL_ACCESS_TOKEN);
	} catch (error) {
		await sendReply(replyToken, '圖片發送失敗，請稍後再試', env.LINE_CHANNEL_ACCESS_TOKEN);
	}
};
