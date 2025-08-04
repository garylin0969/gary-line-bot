// 引入拆分的模組
import { Env, LineEvent } from './types/index.js';
import { logDebug } from './utils/common.js';
import { handleMessage } from './handlers/messageHandler.js';
import { preloadAllHoroscopes } from './services/horoscope.js';
import { preloadAllCopywritings } from './services/copywriting.js';

// 匯出 Durable Object
export { GameStateObject } from './durable-objects/GameStateObject.js';

// 處理預載端點
async function handlePreload(env: Env): Promise<Response> {
	logDebug('Manual preload triggered');
	try {
		await Promise.all([preloadAllHoroscopes(env.HOROSCOPE_CACHE), preloadAllCopywritings(env.COPYWRITING_CACHE)]);
		return new Response('Preload completed', { status: 200 });
	} catch (error) {
		logDebug('Error during manual preload', { error });
		return new Response('Preload failed', { status: 500 });
	}
}

// 處理文案預載端點
async function handleCopywritingPreload(env: Env): Promise<Response> {
	logDebug('Manual copywriting preload triggered');
	try {
		await preloadAllCopywritings(env.COPYWRITING_CACHE);
		return new Response('Copywriting preload completed', { status: 200 });
	} catch (error) {
		logDebug('Error during copywriting preload', { error });
		return new Response('Copywriting preload failed', { status: 500 });
	}
}

// 處理LINE事件
async function handleLineEvents(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	try {
		logDebug('Processing incoming request');
		const body = (await request.json()) as { events: LineEvent[] };
		logDebug('Request body', { body });

		// 並行處理所有事件
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
}

// 處理排程事件
async function handleScheduledEvent(event: ScheduledEvent, env: Env): Promise<void> {
	const now = new Date(event.scheduledTime);
	const utc8Hour = (now.getUTCHours() + 8) % 24; // 轉換為 UTC+8
	const utc8Minute = now.getUTCMinutes();

	logDebug('Scheduled event triggered', {
		time: event.scheduledTime,
		utc8Hour,
		utc8Minute,
	});

	// 每天 UTC+8 00:30 執行運勢預載
	if (utc8Hour === 0 && utc8Minute === 30) {
		await handleHoroscopePreload(env);
	}

	// 每兩小時執行文案預載（在偶數小時的10分鐘執行）
	if (utc8Hour % 2 === 0 && utc8Minute === 10) {
		await handleCopywritingPreloadTask(env);
	}

	// 如果不是任何預載時間，記錄跳過訊息
	const isHoroscopeTime = utc8Hour === 0 && utc8Minute === 30;
	const isCopywritingTime = utc8Hour % 2 === 0 && utc8Minute === 10;

	if (!isHoroscopeTime && !isCopywritingTime) {
		logDebug('Skipping preload - not scheduled time', { utc8Hour, utc8Minute });
	}
}

// 處理運勢預載
async function handleHoroscopePreload(env: Env): Promise<void> {
	logDebug('Starting daily horoscope preload at 00:30');
	try {
		await preloadAllHoroscopes(env.HOROSCOPE_CACHE);
		logDebug('Daily horoscope preload completed successfully');
	} catch (error) {
		logDebug('Error during daily horoscope preload', { error });
	}
}

// 處理文案預載任務
async function handleCopywritingPreloadTask(env: Env): Promise<void> {
	logDebug('Starting copywriting preload');
	try {
		await preloadAllCopywritings(env.COPYWRITING_CACHE);
		logDebug('Copywriting preload completed successfully');
	} catch (error) {
		logDebug('Error during copywriting preload', { error });
	}
}

// 主要處理程序
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 手動預載端點
		if (url.pathname === '/preload' && request.method === 'GET') {
			return handlePreload(env);
		}

		// 手動預載文案端點
		if (url.pathname === '/preload-copywriting' && request.method === 'GET') {
			return handleCopywritingPreload(env);
		}

		// 處理非POST請求
		if (request.method !== 'POST') {
			return new Response('OK', { status: 200 });
		}

		// 處理LINE事件
		return handleLineEvents(request, env, ctx);
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		await handleScheduledEvent(event, env);
	},
};
