import QRCode from "qrcode";

export const baseUrl = () => (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const joinUrl = (codi: string) => `${baseUrl()}/join/${codi}`;

/** Server-side inline SVG; no client JS needed. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
