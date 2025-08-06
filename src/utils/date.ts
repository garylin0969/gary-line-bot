// 日期工具類
// UTC+8 時區偏移（毫秒）
const UTC8_OFFSET = 8 * 60 * 60 * 1000;

// 取得 UTC+8 時區的日期
const getUTC8Date = (): Date => {
	const now = new Date();
	return new Date(now.getTime() + UTC8_OFFSET);
};

// 數字補零
const padZero = (num: number): string => {
	return String(num).padStart(2, '0');
};

// 取得今日的 key（格式：YYYY-MM-DD）
const getTodayKey = (): string => {
	const utc8Date = getUTC8Date();
	const year = utc8Date.getUTCFullYear();
	const month = padZero(utc8Date.getUTCMonth() + 1);
	const day = padZero(utc8Date.getUTCDate());
	return `${year}-${month}-${day}`;
};

// 取得今日日期（格式：MM/DD）
const getTodayDate = (): string => {
	const utc8Date = getUTC8Date();
	const month = padZero(utc8Date.getUTCMonth() + 1);
	const day = padZero(utc8Date.getUTCDate());
	return `${month}/${day}`;
};

// 匯出 DateUtils 物件
export const DateUtils = {
	getTodayKey,
	getTodayDate,
};
