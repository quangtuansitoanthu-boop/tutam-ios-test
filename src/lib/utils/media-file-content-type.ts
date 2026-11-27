/** MIME fallback for file pickers that omit File.type; the server still validates uploads. */
export function mediaFileContentType(file: Pick<File, 'name' | 'type'>): string {
  const known: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf',
  };
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type.trim() || (Object.prototype.hasOwnProperty.call(known, extension) ? known[extension] : 'application/octet-stream');
}
