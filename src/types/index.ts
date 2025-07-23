// LINE 相關型別定義
export interface LineEvent {
	type: string;
	message?: {
		type: string;
		text: string;
	};
	replyToken?: string;
	source?: {
		type: string;
		groupId?: string;
		userId?: string;
	};
}

export interface LineMessage {
	type: string;
	text?: string;
	originalContentUrl?: string;
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
export interface RandomImageResponse {
	success: boolean;
	type: string;
	url: string;
}

export interface TextResponse {
	success: boolean;
	type: string;
	data: {
		id: number;
		content: string;
	};
}

// 占星相關型別定義
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

export interface HoroscopeResponse {
	updated: string;
	updateTime: string;
	totalConstellations: number;
	successCount: number;
	failureCount: number;
	processingTimeMs: number;
	convertedToTraditional: boolean;
	errors: string[];
	horoscopes: Record<string, HoroscopeData>;
}

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

export interface RollResponse {
	point: number;
	isComplete: boolean;
	players: Record<string, number>;
}
