"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { tekstVJson, vVsebino } from "@/lib/obogatenoBesedilo";

/**
 * Urejevalnik besedila za večja polja (zapisniki: Gemba walk, Audit) - app_instructions.md → Urejevalnik besedila.
 * Vrednost je HTML; staro navadno besedilo se ob prikazu pretvori (vrstice, alineje, številčenje, naslovi).
 */
export type UrejevalnikRef = {
  /** Vstavi navadno besedilo na zadnji položaj kurzorja (privzeto na konec) v novo vrstico. */
  vstavi: (tekst: string, fokus?: boolean) => void;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Hover tekst polja. */
  hint: string;
  /** Tailwind razredi za višino polja, npr. "min-h-[28rem] lg:min-h-[calc(100dvh-16rem)]". */
  visina?: string;
  disabled?: boolean;
};

export const UrejevalnikBesedila = forwardRef<UrejevalnikRef, Props>(function UrejevalnikBesedila(
  { value, onChange, placeholder, hint, visina = "min-h-64", disabled = false },
  ref,
) {
  // zadnja vrednost, ki jo je poslal urejevalnik - zunanja sprememba (nalaganje, Zavrzi) zamenja vsebino
  const zadnja = useRef(value);
  const bilFokus = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: vVsebino(value),
    editorProps: {
      attributes: {
        class: `fp-rich ${visina} w-full rounded-b-lg bg-white p-3 text-base leading-relaxed text-ink-900 focus:outline-none sm:text-sm`,
        title: hint,
        "aria-label": hint,
      },
    },
    onFocus: () => (bilFokus.current = true),
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      zadnja.current = html;
      onChangeRef.current(html);
    },
  });

  useEffect(() => {
    if (!editor || value === zadnja.current) return;
    zadnja.current = value;
    editor.commands.setContent(vVsebino(value), { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useImperativeHandle(
    ref,
    () => ({
      vstavi(tekst, fokus = true) {
        if (!editor) return;
        const vozli = tekstVJson(tekst);
        let ukaz = editor.chain();
        // pred prvim klikom v polje vstavimo na konec
        if (!bilFokus.current) ukaz = ukaz.focus("end");
        else ukaz = ukaz.focus();
        // vstavljeno začne v novi vrstici (kot prej v textarea)
        const { $from } = editor.state.selection;
        if ($from.parent.content.size > 0) {
          ukaz = ukaz.command(({ commands }) => commands.splitListItem("listItem") || commands.splitBlock());
        }
        if (vozli.length === 1 && vozli[0].type === "paragraph") {
          const t = vozli[0].content?.[0]?.text ?? "";
          if (t) ukaz = ukaz.insertContent({ type: "text", text: t });
        } else {
          ukaz = ukaz.insertContent(vozli);
        }
        ukaz.run();
        bilFokus.current = true;
        if (!fokus) editor.commands.blur();
      },
    }),
    [editor],
  );

  return (
    <div className="flex flex-col rounded-lg border border-ink-200 focus-within:border-fines-500 focus-within:ring-2 focus-within:ring-fines-100">
      <Orodja editor={editor} disabled={disabled} />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className={`${visina} rounded-b-lg bg-white`} />
      )}
    </div>
  );
});

type Gumb = { ikona: LucideIcon; hint: string; aktiven?: boolean; disabled?: boolean; akcija: () => void };

function Orodja({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const s = useEditorState({
    editor: editor as Editor,
    selector: ({ editor: e }) =>
      e
        ? {
            b: e.isActive("bold"),
            i: e.isActive("italic"),
            u: e.isActive("underline"),
            s: e.isActive("strike"),
            h: e.isActive("heading", { level: 3 }),
            ul: e.isActive("bulletList"),
            ol: e.isActive("orderedList"),
            zamik: e.can().sinkListItem("listItem"),
            odmik: e.can().liftListItem("listItem"),
            nazaj: e.can().undo(),
            naprej: e.can().redo(),
          }
        : null,
  });
  const c = () => editor!.chain().focus();
  const skupine: Gumb[][] = [
    [
      { ikona: Bold, hint: "Krepko (Ctrl+B)", aktiven: s?.b, akcija: () => c().toggleBold().run() },
      { ikona: Italic, hint: "Ležeče (Ctrl+I)", aktiven: s?.i, akcija: () => c().toggleItalic().run() },
      { ikona: Underline, hint: "Podčrtano (Ctrl+U)", aktiven: s?.u, akcija: () => c().toggleUnderline().run() },
      { ikona: Strikethrough, hint: "Prečrtano (Ctrl+Shift+S)", aktiven: s?.s, akcija: () => c().toggleStrike().run() },
    ],
    [
      { ikona: Heading, hint: "Naslov razdelka v zapisniku", aktiven: s?.h, akcija: () => c().toggleHeading({ level: 3 }).run() },
      { ikona: List, hint: "Alineje (vrstica z '- ')", aktiven: s?.ul, akcija: () => c().toggleBulletList().run() },
      { ikona: ListOrdered, hint: "Številčenje (vrstica z '1. ')", aktiven: s?.ol, akcija: () => c().toggleOrderedList().run() },
      { ikona: IndentDecrease, hint: "Zmanjšaj zamik alineje (Shift+Tab)", disabled: !s?.odmik, akcija: () => c().liftListItem("listItem").run() },
      { ikona: IndentIncrease, hint: "Povečaj zamik alineje (Tab)", disabled: !s?.zamik, akcija: () => c().sinkListItem("listItem").run() },
    ],
    [
      { ikona: RemoveFormatting, hint: "Odstrani oblikovanje izbranega besedila", akcija: () => c().unsetAllMarks().clearNodes().run() },
      { ikona: Undo2, hint: "Razveljavi (Ctrl+Z)", disabled: !s?.nazaj, akcija: () => c().undo().run() },
      { ikona: Redo2, hint: "Uveljavi znova (Ctrl+Y)", disabled: !s?.naprej, akcija: () => c().redo().run() },
    ],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Oblikovanje besedila"
      className="flex flex-wrap items-center gap-1 rounded-t-lg border-b border-ink-200 bg-ink-50 p-1 lg:sticky lg:top-[72px] lg:z-10"
    >
      {skupine.map((g, i) => (
        <div key={i} className={`flex items-center gap-0.5 ${i ? "border-l border-ink-200 pl-1" : ""}`}>
          {g.map((b) => (
            <button
              key={b.hint}
              type="button"
              title={b.hint}
              aria-label={b.hint}
              aria-pressed={b.aktiven ?? undefined}
              disabled={!editor || disabled || b.disabled}
              // ne vzemi fokusa urejevalniku (izbira ostane)
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.akcija}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                b.aktiven ? "bg-fines-500 text-white hover:bg-fines-600" : "text-ink-700 hover:bg-ink-200"
              }`}
            >
              <b.ikona className="h-4 w-4" aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
