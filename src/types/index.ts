// LINE 相關型別定義
export interface LineEvent {
	// 事件類型
	type: string;
	message?: {
		type: string;
		text: string;
	};
	// 回覆權杖
	replyToken?: string;
	// 來源
	source?: {
		// 來源類型
		type: string;
		// 群組 ID
		groupId?: string;
		// 使用者 ID
		userId?: string;
	};
}

// LINE 訊息型別定義
export interface LineMessage {
	// 訊息類型
	type: string;
	// 文字內容
	text?: string;
	// 原始內容 URL
	originalContentUrl?: string;
	// 預覽圖片 URL
	previewImageUrl?: string;
}

// 環境變數型別定義
export interface Env {
	LINE_CHANNEL_ACCESS_TOKEN: string;
	HOROSCOPE_CACHE: KVNamespace;
	COPYWRITING_CACHE: KVNamespace;
	GAME_STATE: DurableObjectNamespace;
}

// API 回應型別定義
export interface TextResponse {
	success: boolean;
	type: string;
	data: {
		id: number;
		content: string;
	};
}

// 星座運勢資料
export interface HoroscopeData {
	constellation: string;
	chineseName: string;
	success: boolean;
	code: string;
	msg: string;
	data: {
		ji: string;
		yi: string;
		all: string;
		date: string;
		love: string;
		work: string;
		money: string;
		health: string;
		notice: string;
		discuss: string;
		all_text: string;
		love_text: string;
		work_text: string;
		lucky_star: string;
		money_text: string;
		health_text: string;
		lucky_color: string;
		lucky_number: string;
	};
}

// 星座運勢 API 回應
export interface HoroscopeResponse {
	// 更新時間
	updated: string;
	// 更新時間
	updateTime: string;
	// 總星座數
	totalConstellations: number;
	// 成功次數
	successCount: number;
	// 失敗次數
	failureCount: number;
	// 處理時間
	processingTimeMs: number;
	// 是否轉換為繁體
	convertedToTraditional: boolean;
	// 錯誤訊息
	errors: string[];
	// 星座運勢資料
	horoscopes: Record<string, HoroscopeData>;
}

// 星座運勢快取
export interface CachedHoroscope {
	data: HoroscopeData;
	cachedAt: string;
}

// 文案相關型別定義
export interface CopywritingItem {
	id: number;
	content: string;
	length: number;
	addedAt: string;
}

// 文案 API 回應
export interface CopywritingResponse {
	type: string;
	updated: string;
	updateTime: string;
	totalCount: number;
	targetCount: number;
	completionRate: string;
	convertedToTraditional: boolean;
	copywritings: CopywritingItem[];
}

// 文案快取
export interface CachedCopywriting {
	data: CopywritingResponse;
	cachedAt: string;
}

// 遊戲相關型別定義
export interface GameState {
	players: Record<string, number>;
	maxPlayers: number;
	startedAt: number;
}

// 骰子遊戲 API 回應
export interface RollResponse {
	point: number;
	// 是否完成
	isComplete: boolean;
	// 玩家得分
	players: Record<string, number>;
}
