import nameToEmoji from "gemoji/name-to-emoji.json";
import MarkdownIt from "markdown-it";
// markdown-it-emoji v3 dropped its callable default export in favor of
// named `full`/`light`/`bare` plugin variants. `bare` matches the old
// default (no built-in emoji defs/shortcuts) since we always supply our
// own via gemoji.
import { bare as emojiPlugin } from "markdown-it-emoji";

export default function emoji(md: MarkdownIt): void {
  emojiPlugin(md, {
    defs: nameToEmoji,
    shortcuts: {},
  });
}
