// English-only comments by request.
// Common constants and license type.
export const APP_NAME = "GitZipQR Pro";
export const PROJECT_DIRNAME = ".gitzipqr-pro";
export const LICENSE_FILE = "license.json";
export type License = {
  machineHash: string;
  plan: "PRO";
  paidToken: "ETH" | "USDT";
  txHash: string;
  activatedAt: number;
  validUntil: number; // unix ms
};
