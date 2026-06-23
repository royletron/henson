import { useMemo, useRef } from "preact/hooks";
import Prism from "prismjs";
import "prismjs/components/prism-markdown";

/**
 * Syntax-highlighted editor done the safe way: a plain controlled <textarea>
 * (transparent text, visible caret) layered exactly over a Prism-highlighted
 * <pre>. The textarea is the real input (so it can't loop like our old imperative
 * CodeMirror wrapper did), and the highlight layer is just framework-rendered
 * HTML. Same props as before, so all call sites are unchanged.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export function CodeEditor({
  value,
  onChange,
  onSave,
  language = "markdown",
  readOnly = false,
  placeholder,
  class: className = "",
}: {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  language?: "markdown" | "text";
  readOnly?: boolean;
  placeholder?: string;
  class?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Highlighted HTML for the layer behind the textarea. A trailing newline needs
  // a placeholder char or the last (empty) line collapses out of sync with the textarea.
  const html = useMemo(() => {
    const src = value.endsWith("\n") ? value + " " : value;
    return language === "markdown" && Prism.languages.markdown
      ? Prism.highlight(src, Prism.languages.markdown, "markdown")
      : escapeHtml(src);
  }, [value, language]);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const ta = ref.current!;
      const { selectionStart: s, selectionEnd: en } = ta;
      onChange?.(value.slice(0, s) + "  " + value.slice(en));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
    }
  };

  // Both layers share these so glyph positions (and wrapping) line up exactly.
  const textLayer = "m-0 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words [tab-size:2]";

  return (
    <div class={`relative focus-within:border-violet-500 ${className}`}>
      <pre aria-hidden="true" class={`md-hl pointer-events-none text-zinc-100 ${textLayer}`} dangerouslySetInnerHTML={{ __html: html }} />
      <textarea
        ref={ref}
        class={`absolute inset-0 resize-none bg-transparent px-3 py-2 text-transparent caret-violet-400 outline-none placeholder:text-zinc-600 ${textLayer}`}
        style={{ overflow: "hidden" }}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        spellcheck={false}
        onInput={(e) => onChange?.((e.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
