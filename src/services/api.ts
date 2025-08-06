import { CONFIG } from '../config/constants.js';
import { TextResponse, LineMessage } from '../types/index.js';

// 發送 LINE 訊息
export const sendLineMessages = async (replyToken: string, messages: LineMessage[], accessToken: string): Promise<void> => {
	try {
		const response = await fetch(CONFIG.API.LINE_REPLY, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ replyToken, messages }),
		});

		if (!response.ok) {
			// 發送失敗時靜默處理
		}
	} catch (error) {
		// 發送錯誤時靜默處理
	}
};

// 發送文字回覆
export const sendReply = async (replyToken: string, text: string, accessToken: string): Promise<void> => {
	await sendLineMessages(replyToken, [{ type: 'text', text }], accessToken);
};

// 發送圖片回覆
export const sendImageReply = async (replyToken: string, imageUrl: string, accessToken: string): Promise<void> => {
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
};

// 發送影片回覆
export const sendVideoReply = async (replyToken: string, videoUrl: string, accessToken: string): Promise<void> => {
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
};

// 取得群組成員資料
export const fetchGroupMemberProfile = async (userId: string, groupId: string, accessToken: string): Promise<string> => {
	try {
		const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			return userId;
		}

		const profile = (await response.json()) as { displayName: string };
		return profile.displayName;
	} catch (error) {
		return userId;
	}
};

// 取得文字內容
export const fetchText = async (apiUrl: string): Promise<string | null> => {
	try {
		const response = await fetch(apiUrl);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as TextResponse;

		if (data.success && data.data?.content) {
			return data.data.content;
		}

		return null;
	} catch (error) {
		return null;
	}
};
