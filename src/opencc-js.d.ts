declare module 'opencc-js' {
	export interface ConverterOptions {
		from: string;
		to: string;
	}

	export function Converter(options: ConverterOptions): Promise<(text: string) => Promise<string>>;
}
