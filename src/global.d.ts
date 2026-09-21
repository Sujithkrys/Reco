export {};

declare global {
  interface Window {
    electronAPI: unknown;
    isElectron?: boolean;
  }
}
