declare module 'qrcode' {
  export function toDataURL(text: string, options?: any): Promise<string>;
  export function toDataURL(text: string, callback: (err: Error, url: string) => void): void;
  // Add other methods if needed, but toDataURL is what we use
}
