import { CONFIG } from '../config/constants.js';
import { TextResponse, LineMessage } from '../types/index.js';
import { logDebug } from '../utils/common.js';

// 取得文字內容
export async function fetchText(apiUrl: string): Promise<string | null> {
	try {
		logDebug(`Fetching text from API: ${apiUrl}`);
		const response = await fetch(apiUrl);
		logDebug(`Text API response status: ${response.status}`);

		if (!response.ok) {
			logDebug(`API request failed with status: ${response.status}`);
			return null;
		}

		const data = (await response.json()) as TextResponse;
		logDebug(`Text API response data:`, data);

		if (data.success && data.data?.content) {
			logDebug(`Successfully fetched text: ${data.data.content}`);
			return data.data.content;
		}

		logDebug(`API request was not successful`);
		return null;
	} catch (error) {
		logDebug(`Error fetching text:`, error);
		return null;
	}
}

// 發送 LINE 訊息
export async function sendLineMessages(replyToken: string, messages: LineMessage[], accessToken: string): Promise<void> {
	await fetch(CONFIG.API.LINE_REPLY, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ replyToken, messages }),
	});
}

// 發送文字回覆
export async function sendReply(replyToken: string, text: string, accessToken: string): Promise<void> {
	await sendLineMessages(replyToken, [{ type: 'text', text }], accessToken);
}

// 發送圖片回覆
export async function sendImageReply(replyToken: string, imageUrl: string, accessToken: string): Promise<void> {
	await sendLineMessages(
		replyToken,
		[
			{
				type: 'image',
				originalContentUrl: imageUrl,
				previewImageUrl: imageUrl,
			},
		],
		accessToken
	);
}

// 發送影片回覆
export async function sendVideoReply(replyToken: string, videoUrl: string, accessToken: string): Promise<void> {
	await sendLineMessages(
		replyToken,
		[
			{
				type: 'video',
				originalContentUrl: videoUrl,
				previewImageUrl: videoUrl, // 直接使用影片本身的URL作為預覽圖
			},
		],
		accessToken
	);
}

// 取得群組成員資料
export async function fetchGroupMemberProfile(userId: string, groupId: string, accessToken: string): Promise<string> {
	try {
		const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			logDebug('Failed to fetch group member profile', {
				userId,
				groupId,
				status: response.status,
			});
			return userId;
		}

		const profile = (await response.json()) as { displayName: string };
		return profile.displayName;
	} catch (error) {
		logDebug('Error fetching group member profile', {
			userId,
			groupId,
			error,
		});
		return userId;
	}
}
