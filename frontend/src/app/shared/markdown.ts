import hljs from 'highlight.js/lib/common';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

/**
 * Markdown renderer for assistant replies — the Angular counterpart of
 * SigmaGPT's react-markdown + rehype-highlight pair. Output is bound with
 * [innerHTML], so Angular's sanitizer still strips scripts and event handlers
 * while keeping the `class` attributes highlight.js needs.
 */
const renderer = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  {
    // A reply that is still streaming often ends mid-line; treat single
    // newlines as breaks so partial text does not reflow as it arrives.
    breaks: true,
    gfm: true,
  },
);

export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  return renderer.parse(source, { async: false });
}
