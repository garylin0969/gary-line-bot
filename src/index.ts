// 引入拆分的模組
import { Env, LineEvent } from './types/index.js';
import { handleMessage } from './handlers/messageHandler.js';
import { preloadAllHoroscopes } from './services/horoscope.js';
import { preloadAllCopywritings } from './services/copywriting.js';

// 匯出 Durable Object
export { GameStateObject } from './durable-objects/game-state-object.js';

// 處理預載端點
const handlePreload = async (env: Env): Promise<Response> => {
	try {
		await Promise.all([preloadAllHoroscopes(env.HOROSCOPE_CACHE), preloadAllCopywritings(env.COPYWRITING_CACHE)]);
		return new Response('Preload completed', { status: 200 });
	} catch (error) {
		return new Response('Preload failed', { status: 500 });
	}
};

// 處理文案預載端點
const handleCopywritingPreload = async (env: Env): Promise<Response> => {
	try {
		await preloadAllCopywritings(env.COPYWRITING_CACHE);
		return new Response('Copywriting preload completed', { status: 200 });
	} catch (error) {
		return new Response('Copywriting preload failed', { status: 500 });
	}
};

// 處理LINE事件
const handleLineEvents = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
	try {
		const body = (await request.json()) as { events: LineEvent[] };

		// 並行處理所有事件
		await Promise.all(
			body.events.map(async (event) => {
				try {
					await handleMessage(event, env, ctx);
				} catch (error) {
					// 錯誤處理
				}
			})
		);

		return new Response('OK', { status: 200 });
	} catch (error) {
		return new Response('Error', { status: 500 });
	}
};

// 處理排程事件
const handleScheduledEvent = async (event: ScheduledEvent, env: Env): Promise<void> => {
	const now = new Date(event.scheduledTime);
	const utc8Hour = (now.getUTCHours() + 8) % 24; // 轉換為 UTC+8
	const utc8Minute = now.getUTCMinutes();

	// 每天 UTC+8 00:30 執行運勢預載
	if (utc8Hour === 0 && utc8Minute === 30) {
		await handleHoroscopePreload(env);
	}

	// 每兩小時執行文案預載（在偶數小時的10分鐘執行）
	if (utc8Hour % 2 === 0 && utc8Minute === 10) {
		await handleCopywritingPreloadTask(env);
	}
};

// 處理運勢預載
const handleHoroscopePreload = async (env: Env): Promise<void> => {
	try {
		await preloadAllHoroscopes(env.HOROSCOPE_CACHE);
	} catch (error) {
		// 預載失敗時靜默處理
	}
};

// 處理文案預載任務
const handleCopywritingPreloadTask = async (env: Env): Promise<void> => {
	try {
		await preloadAllCopywritings(env.COPYWRITING_CACHE);
	} catch (error) {
		// 預載失敗時靜默處理
	}
};

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
