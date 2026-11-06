export type QrCode = Readonly<{ version: number; size: number; mask: number; modules: readonly (readonly boolean[])[] }>;

export function encodeQr(text: string, options?: Readonly<{ mask?: number | null }>): QrCode;
export function qrPath(code: QrCode, border?: number): string;
