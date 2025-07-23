// 日期工具函數
export const DateUtils = {
	// 取得今日的 key（格式：YYYY-MM-DD）
	getTodayKey(): string {
		const now = new Date();
		const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
		return utc8.toISOString().split('T')[0];
	},

	// 取得今日日期（格式：MM/DD）
	getTodayDate(): string {
		const now = new Date();
		const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
		const month = String(utc8.getMonth() + 1).padStart(2, '0');
		const day = String(utc8.getDate()).padStart(2, '0');
		return `${month}/${day}`;
	},
};
