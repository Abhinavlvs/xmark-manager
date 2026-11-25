/**
 * Tiny JavaScript lexer for static checks: removes comments, blanks string and regex literals and
 * template text, but keeps the code inside `${...}` template expressions. Not a parser; good enough
 * to look for identifiers without being fooled by comments, strings or newlines.
 * A string literal that is exactly `browser` or `chrome` right after `[` is kept as a bare word so
 * bracket access (`globalThis['chrome']`) is visible to the identifier rules.
 */

const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const WATCHED = new Set(['browser', 'chrome']);

export function stripJs(src) {
  let out = '';
  let i = 0;
  const lastCode = () => out.trimEnd().slice(-1);

  function skipString(quote) {
    let text = '';
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        text += src[i++];
      }
      text += src[i++];
    }
    i++;
    return text;
  }

  function template() {
    out += '``';
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') i += 2;
      else if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        out += ' ';
        code('}');
        out += ' ';
      } else i++;
    }
    i++;
  }

  function code(until) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (until && c === '}' && depth === 0) {
        i++;
        return;
      }
      if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
        out += ' ';
      } else if (c === '"' || c === "'") {
        const prev = lastCode();
        const text = skipString(c);
        out += prev === '[' && WATCHED.has(text) ? text : '""';
      } else if (c === '`') {
        template();
      } else if (c === '/' && (lastCode() === '' || REGEX_PREV.has(lastCode()))) {
        i++;
        let inClass = false;
        while (i < src.length && (src[i] !== '/' || inClass) && src[i] !== '\n') {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          i++;
        }
        i++;
        while (/[a-z]/i.test(src[i] ?? '')) i++;
        out += '/r/';
      } else {
        if (c === '{') depth++;
        if (c === '}') depth--;
        out += c;
        i++;
      }
    }
  }

  code(null);
  return out;
}
