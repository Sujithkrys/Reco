export {};

declare global {
  interface Window {
    electronAPI: any;
    isElectron?: boolean;
  }
}
