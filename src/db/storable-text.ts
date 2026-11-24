// Postgres can't store the NUL character (U+0000) in text, and refuses the whole query if one is sent. Text pasted
// from some apps or PDFs can hold one, invisibly, so it is left out of anything typed before it reaches the database.
export const storableText = (text: string) => text.replaceAll("\u0000", "");
