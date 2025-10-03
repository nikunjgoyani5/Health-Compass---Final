import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { getVideoDurationInSeconds } from "get-video-duration";

export async function getDurationFromBuffer(buffer) {
  // 1) Try with a Node Readable stream
  try {
    const stream = Readable.from(buffer);
    const secs = await getVideoDurationInSeconds(stream);
    return secs;
  } catch (e) {
    // 2) Fallback to a temp file if stream fails
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vid-"));
    const tmpFile = path.join(tmpDir, `upload-${Date.now()}.tmp`);
    try {
      await fs.promises.writeFile(tmpFile, buffer);
      const secs = await getVideoDurationInSeconds(tmpFile);
      return secs;
    } finally {
      // cleanup best-effort
      fs.promises.unlink(tmpFile).catch(() => {});
      fs.promises.rmdir(tmpDir).catch(() => {});
    }
  }
}

export function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}
