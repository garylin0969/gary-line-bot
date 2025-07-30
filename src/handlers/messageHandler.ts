import * as OpenCC from 'opencc-js';
import { LineEvent, Env } from '../types/index.js';
import { KEY_WORDS_REPLY, CONFIG } from '../config/constants.js';
import { logDebug } from '../utils/common.js';
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

// OpenCC 轉換器
let converter: Promise<(text: string) => Promise<string>> | null = null;

async function getConverter(): Promise<(text: string) => Promise<string>> {
	if (!converter) {
		converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
	}
	return converter;
}

// 主要訊息處理函數
export async function handleMessage(event: LineEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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

// 檢查是否為命令
function isCommand(text: string): boolean {
	// 先將全形符號轉換為半形符號
	const normalizedText = text?.replace(/[！]/g, '!')?.toLocaleLowerCase();

	const isRoll = normalizedText === '!roll';
	const isRollNum = normalizedText.startsWith('!rollnum');
	const isDraw = normalizedText === '抽';
	const isBlackSilk = normalizedText === '!黑絲';
	const isWhiteSilk = normalizedText === '!白絲';
	const isRomanticCopywriting = normalizedText === '!騷話' || normalizedText === '!骚话';
	const isLoveCopywriting = normalizedText === '!情話';
	const isFunnyCopywriting = normalizedText === '!幹話';
	const isNSFW = text === '色色';
	const isKeyWords = Boolean(Object?.keys(KEY_WORDS_REPLY)?.find((key) => normalizedText?.includes(key)));

	const isGay =
		normalizedText === '!gay' ||
		normalizedText === '!Gay' ||
		normalizedText === 'gay' ||
		normalizedText === 'Gay' ||
		normalizedText === '!甲' ||
		normalizedText === '甲' ||
		normalizedText === '!甲圖' ||
		normalizedText === '甲圖';
	const result =
		isRoll ||
		isRollNum ||
		isDraw ||
		isRomanticCopywriting ||
		isNSFW ||
		isKeyWords ||
		isBlackSilk ||
		isWhiteSilk ||
		isLoveCopywriting ||
		isFunnyCopywriting ||
		isGay;

	logDebug('Command detection', {
		originalText: text,
		normalizedText,
		isRoll,
		isRollNum,
		isDraw,
		isBlackSilk,
		isWhiteSilk,
		isRomanticCopywriting,
		isLoveCopywriting,
		isFunnyCopywriting,
		isNSFW,
		isKeyWords,
		isGay,
		result,
	});

	return result;
}

// 處理命令
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
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_GIRL_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「黑絲」命令
	if (normalizedText === '!黑絲') {
		logDebug('Detected black silk command');
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_BLACK_SILK_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「白絲」命令
	if (normalizedText === '!白絲') {
		logDebug('Detected white silk command');
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_WHITE_SILK_IMAGE + '?rand=' + Math.random(), env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「色色」命令
	if (text === '色色') {
		logDebug('Detected NSFW command');
		await sendImageReply(event.replyToken!, CONFIG.API.RANDOM_PORN_IMAGE, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	// 處理「情話」命令
	if (normalizedText === '!情話') {
		logDebug('Detected love copywriting command');
		const copywritingText = await getRandomCopywritingText(CONFIG.API.LOVE_COPYWRITING_TEXT, 'love_copywriting', env.COPYWRITING_CACHE);
		if (copywritingText) {
			await sendReply(event.replyToken!, copywritingText, env.LINE_CHANNEL_ACCESS_TOKEN);
		}
		return;
	}

	// 處理「幹話」命令
	if (normalizedText === '!幹話') {
		logDebug('Detected funny copywriting command');
		const copywritingText = await getRandomCopywritingText(CONFIG.API.FUNNY_COPYWRITING_TEXT, 'funny_copywriting', env.COPYWRITING_CACHE);
		if (copywritingText) {
			await sendReply(event.replyToken!, copywritingText, env.LINE_CHANNEL_ACCESS_TOKEN);
		}
		return;
	}

	// 處理「騷話」命令
	if (normalizedText === '!騷話') {
		logDebug('Detected sexy text command');
		const copywritingText = await getRandomCopywritingText(
			CONFIG.API.ROMANTIC_COPYWRITING_TEXT,
			'romantic_copywriting',
			env.COPYWRITING_CACHE
		);
		if (copywritingText) {
			await sendReply(event.replyToken!, copywritingText, env.LINE_CHANNEL_ACCESS_TOKEN);
		}
		return;
	}

	// 處理「甲」命令
	if (
		normalizedText === '!gay' ||
		normalizedText === 'gay' ||
		normalizedText === '!Gay' ||
		normalizedText === 'Gay' ||
		normalizedText === '!甲' ||
		normalizedText === '甲' ||
		normalizedText === '!甲圖' ||
		normalizedText === '甲圖'
	) {
		logDebug('Detected gay command');
		await handleGay(event.replyToken!, env);
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

// 處理遊戲命令
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

// 處理一般訊息
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

// 處理占星
async function handleHoroscope(zodiacKey: string, replyToken: string, userId: string, env: Env, ctx: ExecutionContext): Promise<void> {
	// 檢查是否為許雲藏的訊息
	if (userId === 'U10e6659922346d74db502c05e908bc55') {
		// 請替換成許雲藏的實際 LINE User ID
		const customMessage = await getCustomHoroscopeForUser(zodiacKey);
		await sendReply(replyToken, customMessage, env.LINE_CHANNEL_ACCESS_TOKEN);
		return;
	}

	let data = null;
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

// 處理甲圖
async function handleGay(replyToken: string, env: Env): Promise<void> {
	try {
		// 隨機選擇 1-20 之間的數字
		const randomNumber = Math.floor(Math.random() * 20) + 1;

		// 構建圖片 URL（透過 Cloudflare Workers 的靜態資源）
		// 使用 Worker 的域名來存取靜態資源
		const imageUrl = `https://garylin0969.github.io/json-gather/data/images/gay/gay${randomNumber}.jpg`;

		logDebug('Sending gay image', { randomNumber, imageUrl });
		await sendImageReply(replyToken, imageUrl, env.LINE_CHANNEL_ACCESS_TOKEN);
		logDebug('Gay image sent successfully');
	} catch (error) {
		logDebug('Error handling gay image', { error });
		await sendReply(replyToken, '圖片發送失敗，請稍後再試', env.LINE_CHANNEL_ACCESS_TOKEN);
	}
}
