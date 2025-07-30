// 日期工具類
class DateUtils {
	// UTC+8 時區偏移（毫秒）
	private static readonly UTC8_OFFSET = 8 * 60 * 60 * 1000;

	// 取得今日的 key（格式：YYYY-MM-DD）
	static getTodayKey(): string {
		const utc8Date = this.getUTC8Date();
		const year = utc8Date.getUTCFullYear();
		const month = this.padZero(utc8Date.getUTCMonth() + 1);
		const day = this.padZero(utc8Date.getUTCDate());
		return `${year}-${month}-${day}`;
	}

	// 取得今日日期（格式：MM/DD）
	static getTodayDate(): string {
		const utc8Date = this.getUTC8Date();
		const month = this.padZero(utc8Date.getUTCMonth() + 1);
		const day = this.padZero(utc8Date.getUTCDate());
		return `${month}/${day}`;
	}

	// 取得 UTC+8 時區的日期
	private static getUTC8Date(): Date {
		const now = new Date();
		return new Date(now.getTime() + this.UTC8_OFFSET);
	}

	// 數字補零
	private static padZero(num: number): string {
		return String(num).padStart(2, '0');
	}
}

// 匯出 DateUtils 物件
export { DateUtils };
