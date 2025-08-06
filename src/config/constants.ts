// API 和系統配置常數
export const CONFIG = {
	ROLL: {
		MAX_PLAYERS: 10,
		TIMEOUT: 30 * 60 * 1000, // 30分鐘
	},
	CACHE: {
		EXPIRATION: 25 * 60 * 60, // 25小時後過期
		COPYWRITING_EXPIRATION: 2 * 60 * 60, // 2小時後過期
	},
	API: {
		RANDOM_GIRL_IMAGE: 'https://v2.api-m.com/api/meinvpic?return=302', // 隨機美女圖
		RANDOM_BLACK_SILK_IMAGE: 'https://v2.api-m.com/api/heisi?return=302', // 隨機黑絲圖
		RANDOM_WHITE_SILK_IMAGE: 'https://v2.api-m.com/api/baisi?return=302', // 隨機白絲圖
		RANDOM_PORN_IMAGE: 'https://moe.jitsu.top/img?sort=r18&size=small', // 隨機色圖
		HOROSCOPE: 'https://garylin0969.github.io/json-gather/data/horoscope.json', // 星座運勢
		LOVE_COPYWRITING_TEXT: 'https://garylin0969.github.io/json-gather/data/love-copywriting.json', // 愛情文案
		FUNNY_COPYWRITING_TEXT: 'https://garylin0969.github.io/json-gather/data/funny-copywriting.json', // 搞笑文案
		ROMANTIC_COPYWRITING_TEXT: 'https://garylin0969.github.io/json-gather/data/romantic-copywriting.json', // 浪漫文案
		// CAT_RANDOM_IMAGE: 'https://api.ai-cats.net/v1/cat?size=256&theme=All', // 貓咪隨機圖
		CAT_RANDOM_IMAGE: 'https://cataas.com/cat', // 貓咪隨機圖
		LINE_REPLY: 'https://api.line.me/v2/bot/message/reply', // LINE 回覆
	},
} as const;

// 關鍵字自動回覆配置
export const KEY_WORDS_REPLY = {
	張瑋烝: '又偷操學生妹==',
	'@張瑋烝': '又偷操學生妹==',
	許雲藏: '又再做愛？',
	'@許雲藏': '又再做愛？',
	皓: '現在考到N幾了？',
	'@皓(Ryan)': '現在考到N幾了？',
	stanley: '勝利爸爸...',
	'@stanley': '勝利爸爸...',
	周采彤: '千金大小姐...',
	'@周采彤': '千金大小姐...',
	笑死: '啊是死了沒辣',
	幹: '好 幹我 幹死我',
	勝利: '那ㄋ很失敗囉？',
	花式炫: '炫你嘴裡',
	又在炫: '炫你嘴裡',
	靠北: '順便靠母了嗎 恭喜',
	這我: '又你了',
	幹你娘: '先幹我',
	幹妳娘: '先幹我',
	早安: '沒人想跟你打招呼',
	'？': '？你媽',
	'?': '？你媽',
};

// 星座對應表
export const zodiacMap: Record<string, string> = {
	牡羊: 'aries',
	白羊: 'aries',
	金牛: 'taurus',
	雙子: 'gemini',
	双子: 'gemini',
	巨蟹: 'cancer',
	巨蠍: 'cancer',
	獅子: 'leo',
	狮子: 'leo',
	處女: 'virgo',
	处女: 'virgo',
	天秤: 'libra',
	天蠍: 'scorpio',
	天蝎: 'scorpio',
	射手: 'sagittarius',
	魔羯: 'capricorn',
	摩羯: 'capricorn',
	水瓶: 'aquarius',
	雙魚: 'pisces',
	双鱼: 'pisces',
};
