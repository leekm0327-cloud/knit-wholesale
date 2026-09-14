import { z } from "zod";

export const POPUP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POPUP_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const POPUP_IMAGE_ACCEPT = POPUP_IMAGE_TYPES.join(",");

// Only inline raster images: no arbitrary URLs, HTML, or SVG documents.
export const popupImageSchema = z.string()
  .max(Math.ceil(POPUP_IMAGE_MAX_BYTES / 3) * 4 + 32, "이미지는 5MB 이하로 첨부해 주세요.")
  .refine((value) => {
    if (!value) return true;
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) return false;
    const payload = match[2];
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return payload.length / 4 * 3 - padding <= POPUP_IMAGE_MAX_BYTES;
  }, "5MB 이하의 JPG, PNG, WEBP, GIF 이미지를 첨부해 주세요.");
