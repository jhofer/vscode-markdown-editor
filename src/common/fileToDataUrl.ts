/**
 * Converts a File to a base64 data URL.
 * This is a browser/webview-only function that uses FileReader.
 */
export const fileToDataUrl = async (file: File): Promise<string> => {
  const imageUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
  return imageUrl;
};
