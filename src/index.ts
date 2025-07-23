// 引入拆分的模組
import { Env, LineEvent } from './types/index.js';
import { logDebug } from './utils/common.js';
import { handleMessage } from './handlers/messageHandler.js';
import { preloadAllHoroscopes } from './services/horoscope.js';
import { preloadAllCopywritings } from './services/copywriting.js';

// 匯出 Durable Object
export { GameStateObject } from './durable-objects/GameStateObject.js';

// 主要處理程序
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 手動預載端點
		if (url.pathname === '/preload' && request.method === 'GET') {
			logDebug('Manual preload triggered');
			await Promise.all([preloadAllHoroscopes(env.HOROSCOPE_CACHE), preloadAllCopywritings(env.COPYWRITING_CACHE)]);
			return new Response('Preload completed', { status: 200 });
		}

		// 手動預載文案端點
		if (url.pathname === '/preload-copywriting' && request.method === 'GET') {
			logDebug('Manual copywriting preload triggered');
			await preloadAllCopywritings(env.COPYWRITING_CACHE);
			return new Response('Copywriting preload completed', { status: 200 });
		}

		if (request.method !== 'POST') {
			return new Response('OK', { status: 200 });
		}

		try {
			logDebug('Processing incoming request');
			const body = (await request.json()) as { events: LineEvent[] };
			logDebug('Request body', { body });

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
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const now = new Date(event.scheduledTime);
		const utc8Hour = (now.getUTCHours() + 8) % 24; // 轉換為 UTC+8
		const utc8Minute = now.getUTCMinutes();

		logDebug('Scheduled event triggered', {
			time: event.scheduledTime,
			utc8Hour,
			utc8Minute,
		});

		// 每天 UTC+8 00:10 執行運勢預載
		if (utc8Hour === 0 && utc8Minute === 10) {
			logDebug('Starting daily horoscope preload at 00:10');
			try {
				await preloadAllHoroscopes(env.HOROSCOPE_CACHE);
				logDebug('Daily horoscope preload completed successfully');
			} catch (error) {
				logDebug('Error during daily horoscope preload', { error });
			}
		}

		// 每兩小時執行文案預載（在偶數小時的10分鐘執行）
		if (utc8Hour % 2 === 0 && utc8Minute === 10) {
			logDebug('Starting copywriting preload', { utc8Hour });
			try {
				await preloadAllCopywritings(env.COPYWRITING_CACHE);
				logDebug('Copywriting preload completed successfully');
			} catch (error) {
				logDebug('Error during copywriting preload', { error });
			}
		}

		if (utc8Hour % 2 !== 0 || utc8Minute !== 10) {
			if (!(utc8Hour === 0 && utc8Minute === 10)) {
				logDebug('Skipping preload - not scheduled time', { utc8Hour, utc8Minute });
			}
		}
	},
};
