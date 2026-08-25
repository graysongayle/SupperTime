"use client";

import {
  FileText,
  Forward,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { forwardTicket } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type TicketForwardSheetProps = {
  cannedResponses?: CannedResponse[];
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
};

type CannedResponse = {
  id: string;
  title: string;
  body: string;
  bodyHtml: string | null;
};

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

function renderPlainTextAsHtml(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br>");

      return `<p>${lines}</p>`;
    })
    .join("");
}

export function TicketForwardSheet({
  cannedResponses = [],
  ticketId,
  ticketNumber,
  ticketSubject,
}: TicketForwardSheetProps) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [noteHtml, setNoteHtml] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedTemplate =
    cannedResponses.find((template) => template.id === selectedTemplateId) ??
    null;

  function syncEditorState() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setNote(editor.innerText.replace(/\u00a0/g, " ").trim());
    setNoteHtml(editor.innerHTML);
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

  function setTextColor(color: string) {
    runEditorCommand("foreColor", color);
  }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");

    if (!url) {
      return;
    }

    runEditorCommand("createLink", url);
  }

  function insertTemplate() {
    if (!selectedTemplate || !editorRef.current) {
      return;
    }

    const editor = editorRef.current;
    const html =
      selectedTemplate.bodyHtml || renderPlainTextAsHtml(selectedTemplate.body);
    const separator = editor.innerText.trim() ? "<p><br></p>" : "";

    editor.insertAdjacentHTML("beforeend", `${separator}${html}`);
    syncEditorState();
    editor.focus();
  }

  function resetNoteEditor() {
    setNote("");
    setNoteHtml("");
    setSelectedTemplateId("");

    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  }

  function submit(formData: FormData) {
    syncEditorState();

    if (editorRef.current) {
      formData.set("note", editorRef.current.innerText.trim());
      formData.set("noteHtml", editorRef.current.innerHTML);
    }

    startTransition(async () => {
      try {
        const result = await forwardTicket(formData);

        toast({
          variant: "success",
          title: "Forwarded",
          description: result.message,
        });
        resetNoteEditor();
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Forward failed",
          description:
            error instanceof Error ? error.message : "The ticket was not forwarded.",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-white">
          <Forward data-icon="inline-start" />
          Forward
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Forward ticket #{ticketNumber}</DialogTitle>
          <DialogDescription>{ticketSubject}</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-5">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="mode" value="link" />
          <input type="hidden" name="note" value={note} />
          <input type="hidden" name="noteHtml" value={noteHtml} />
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>To</span>
            <input
              name="to"
              type="email"
              multiple
              required
              placeholder="name@example.com, teammate@example.com"
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Separate multiple recipients with commas.
            </span>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>Subject</span>
            <input
              name="subject"
              defaultValue={`Fwd: Ticket #${ticketNumber} - ${ticketSubject}`}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
            />
          </label>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="forwardNote"
              className="text-sm font-medium text-zinc-950"
            >
              Note
            </label>
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <label
                    htmlFor="forwardCannedResponse"
                    className="text-sm font-medium text-zinc-950"
                  >
                    Templates
                  </label>
                  <select
                    id="forwardCannedResponse"
                    value={selectedTemplateId}
                    className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs outline-none focus:border-cyan-600"
                    onChange={(event) => {
                      setSelectedTemplateId(event.target.value);
                    }}
                  >
                    <option value="">Choose a template</option>
                    {cannedResponses.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-end bg-white"
                  disabled={!selectedTemplate}
                  onClick={insertTemplate}
                >
                  <FileText data-icon="inline-start" />
                  Insert
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-end bg-white"
                  asChild
                >
                  <Link
                    href="/tickets/templates"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage
                  </Link>
                </Button>
              </div>
            </div>
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
                    onClick={() => setTextColor(color.value)}
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
              id="forwardNote"
              role="textbox"
              aria-label="Note"
              aria-multiline="true"
              contentEditable
              data-placeholder="Add context for the person receiving this forward."
              className="min-h-32 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-cyan-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
              onBlur={syncEditorState}
              onInput={syncEditorState}
              onPaste={handlePaste}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-white"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Forward ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
