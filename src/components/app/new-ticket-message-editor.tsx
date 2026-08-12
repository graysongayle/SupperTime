"use client";

import {
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

const textColorOptions = [
  { label: "Default text", value: "#18181b" },
  { label: "Red", value: "#b91c1c" },
  { label: "Amber", value: "#b45309" },
  { label: "Green", value: "#047857" },
  { label: "Blue", value: "#0369a1" },
  { label: "Purple", value: "#7e22ce" },
];
const allowedTextColors = new Set(textColorOptions.map((color) => color.value));

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeTextColor(value: string) {
  const color = value.trim().toLowerCase();

  if (allowedTextColors.has(color)) {
    return color;
  }

  const rgbMatch = color.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
  );

  if (!rgbMatch) {
    return null;
  }

  const [red, green, blue] = rgbMatch.slice(1).map(Number);

  if ([red, green, blue].some((channel) => channel < 0 || channel > 255)) {
    return null;
  }

  const hex = rgbToHex(red, green, blue);
  return allowedTextColors.has(hex) ? hex : null;
}

function isSafeEditorHref(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizePastedHtmlNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const childrenHtml = Array.from(element.childNodes)
    .map(sanitizePastedHtmlNode)
    .join("");

  if (tagName === "br") {
    return "<br>";
  }

  if (tagName === "b" || tagName === "strong") {
    return `<strong>${childrenHtml}</strong>`;
  }

  if (tagName === "i" || tagName === "em") {
    return `<em>${childrenHtml}</em>`;
  }

  if (tagName === "u") {
    return `<u>${childrenHtml}</u>`;
  }

  if (tagName === "ul" || tagName === "ol" || tagName === "li") {
    return `<${tagName}>${childrenHtml}</${tagName}>`;
  }

  if (tagName === "p" || tagName === "div") {
    return `<p>${childrenHtml}</p>`;
  }

  if (tagName === "a") {
    const href = element.getAttribute("href") ?? "";
    return isSafeEditorHref(href)
      ? `<a href="${escapeHtml(href)}">${childrenHtml}</a>`
      : childrenHtml;
  }

  if (tagName === "span" || tagName === "font") {
    const color =
      normalizeTextColor(element.style.color) ??
      normalizeTextColor(element.getAttribute("color") ?? "");

    return color
      ? `<span style="color: ${color}">${childrenHtml}</span>`
      : childrenHtml;
  }

  return childrenHtml;
}

function sanitizePastedHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.body.childNodes)
    .map(sanitizePastedHtmlNode)
    .join("");
}

export function NewTicketMessageEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  function syncEditorState() {
    const editor = editorRef.current;

    if (!editor || !bodyInputRef.current || !htmlInputRef.current) {
      return;
    }

    bodyInputRef.current.value = editor.innerText
      .replace(/\u00a0/g, " ")
      .trim();
    htmlInputRef.current.value = editor.innerHTML;
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pastedHtml = event.clipboardData.getData("text/html");
    const pastedText = event.clipboardData.getData("text/plain");

    if (!pastedHtml && !pastedText) {
      return;
    }

    event.preventDefault();
    const sanitizedHtml = pastedHtml ? sanitizePastedHtml(pastedHtml) : "";

    if (sanitizedHtml) {
      document.execCommand("insertHTML", false, sanitizedHtml);
    } else {
      document.execCommand("insertText", false, pastedText);
    }

    syncEditorState();
  }

  function runEditorCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorState();
  }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");

    if (!url) {
      return;
    }

    runEditorCommand("createLink", url);
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={bodyInputRef} type="hidden" name="description" />
      <input ref={htmlInputRef} type="hidden" name="descriptionHtml" />
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Bold"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand("bold")}
        >
          <span className="font-bold leading-none">B</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Italic"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand("italic")}
        >
          <Italic />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Underline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand("underline")}
        >
          <Underline />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Bulleted list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand("insertUnorderedList")}
        >
          <List />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Numbered list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand("insertOrderedList")}
        >
          <ListOrdered />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertLink}
        >
          <LinkIcon />
        </Button>
        <span className="mx-1 h-5 w-px bg-zinc-200" />
        <span className="flex items-center gap-1">
          {textColorOptions.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              title={color.label}
              className="flex size-6 items-center justify-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runEditorCommand("foreColor", color.value)}
            >
              <span
                className="size-3 rounded-full border border-zinc-200"
                style={{ backgroundColor: color.value }}
              />
            </button>
          ))}
        </span>
      </div>
      <div
        ref={editorRef}
        id="description"
        role="textbox"
        aria-label="Customer request details"
        aria-multiline="true"
        contentEditable
        data-placeholder="Enter the customer-facing request details that should appear in the ticket thread."
        className="min-h-56 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-cyan-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
        onBlur={syncEditorState}
        onInput={syncEditorState}
        onPaste={handlePaste}
      />
    </div>
  );
}
