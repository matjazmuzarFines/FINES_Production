// Pomanjšanje fotografije pred nalaganjem (prihranek prostora in hitrejši sync).

const MAX_SIZE = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Pretvorba slike ni uspela."))),
      "image/jpeg",
      QUALITY,
    ),
  );
}
