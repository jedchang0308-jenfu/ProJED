/** Offsets in the existing RAG chunk metadata are UTF-16 string positions in
 * this normalized content, not Unicode code point positions. */
export const normalizeRagChunkContent=(content:string):string=>content
  .replace(/\r\n/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
