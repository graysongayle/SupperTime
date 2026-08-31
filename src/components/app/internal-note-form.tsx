"use client";

import {
  AtSign,
  FileText,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MessageSquarePlus,
  Underline,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addInternalNote } from "@/app/(app)/tickets/actions";
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
import { cn } from "@/lib/utils";

type MentionUser = {
  email: string;
  id: string;
  name: string | null;
};

type CannedResponse = {
  id: string;
  title: string;
  body: string;
  bodyHtml: string | null;
};

type InternalNoteFormProps = {
  cannedResponses?: CannedResponse[];
  currentUserId: string | null;
  mentionUsers: MentionUser[];
  ticketId: string;
};

type ActiveMention = {
  end: number;
  query: string;
  start: number;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMentionHandle(user: MentionUser) {
  const localPart = user.email.split("@")[0]?.toLowerCase() ?? "";
  return localPart.replace(/[^a-z0-9._+-]/g, "") || user.email.toLowerCase();
}

function createMentionBadgeElement(user: MentionUser, onRemove: () => void) {
  const handle = getMentionHandle(user);
  const badge = document.createElement("span");
  const label = document.createElement("span");
  const removeButton = document.createElement("button");

  badge.setAttribute("contenteditable", "false");
  badge.setAttribute("data-mention-chip", "true");
  badge.setAttribute("data-mention-user-id", user.id);
  badge.setAttribute(
    "title",
    user.name ? `${user.name} <${user.email}>` : user.email,
  );
  badge.className =
    "mx-0.5 inline-flex h-5 max-w-44 select-none items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 align-baseline text-xs font-medium text-cyan-800";
  label.className = "min-w-0 truncate";
  label.textContent = `@${handle}`;
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", `Remove @${handle}`);
  removeButton.setAttribute("tabindex", "-1");
  removeButton.className =
    "-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-cyan-700 hover:bg-cyan-100 hover:text-cyan-950";
  removeButton.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  removeButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  removeButton.addEventListener("click", (event) => {
    event.preventDefault();
    const parent = badge.parentNode;
    const nextSibling = badge.nextSibling;

    if (nextSibling?.nodeType === Node.TEXT_NODE) {
      nextSibling.textContent = (nextSibling.textContent ?? "").replace(/^ /, "");
    }

    badge.remove();

    if (parent) {
      const range = document.createRange();
      const selection = window.getSelection();

      if (nextSibling && nextSibling.parentNode === parent) {
        range.setStartBefore(nextSibling);
      } else {
        range.selectNodeContents(parent);
        range.collapse(false);
      }

      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    onRemove();
  });
  badge.append(label, removeButton);

  return badge;
}

function getUserSearchText(user: MentionUser) {
  return [
    user.name,
    user.email,
    getMentionHandle(user),
    ...getMentionHandle(user).split(/[+._-]+/),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findActiveMention(value: string, caret: number): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|[\s([{])@([a-zA-Z0-9._+-]{0,64})$/.exec(beforeCaret);

  if (!match) {
    return null;
  }

  return {
    end: caret,
    query: match[2].toLowerCase(),
    start: caret - match[2].length - 1,
  };
}

function findActiveMentionAtCaret(container: HTMLElement): ActiveMention | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return findActiveMention(container.innerText, container.innerText.length);
  }

  const range = selection.getRangeAt(0);

  if (!container.contains(range.endContainer)) {
    return findActiveMention(container.innerText, container.innerText.length);
  }

  const caret = getCaretTextOffset(container);

  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const textBeforeCaret = (range.endContainer.textContent ?? "").slice(
      0,
      range.endOffset,
    );
    const match = /(^|[\s([{])@([a-zA-Z0-9._+-]{0,64})$/.exec(textBeforeCaret);

    if (match) {
      return {
        end: caret,
        query: match[2].toLowerCase(),
        start: caret - match[2].length - 1,
      };
    }
  }

  return findActiveMention(container.innerText, caret);
}

function getCaretTextOffset(container: HTMLElement) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return container.innerText.length;
  }

  const range = selection.getRangeAt(0);

  if (!container.contains(range.endContainer)) {
    return container.innerText.length;
  }

  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(container);
  preCaretRange.setEnd(range.endContainer, range.endOffset);

  return preCaretRange.toString().length;
}

function createTextRange(container: HTMLElement, start: number, end: number) {
  const range = document.createRange();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startSet = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nextOffset = currentOffset + (node.textContent ?? "").length;

    if (!startSet && start >= currentOffset && start <= nextOffset) {
      range.setStart(node, start - currentOffset);
      startSet = true;
    }

    if (end >= currentOffset && end <= nextOffset) {
      range.setEnd(node, end - currentOffset);
      return range;
    }

    currentOffset = nextOffset;
  }

  range.selectNodeContents(container);
  range.collapse(false);
  return range;
}

function createActiveMentionRangeAtCaret(
  container: HTMLElement,
  activeMention: ActiveMention,
) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return createTextRange(container, activeMention.start, activeMention.end);
  }

  const selectionRange = selection.getRangeAt(0);

  if (
    container.contains(selectionRange.endContainer) &&
    selectionRange.endContainer.nodeType === Node.TEXT_NODE
  ) {
    const textNode = selectionRange.endContainer;
    const textBeforeCaret = (textNode.textContent ?? "").slice(
      0,
      selectionRange.endOffset,
    );
    const match = /(^|[\s([{])@([a-zA-Z0-9._+-]{0,64})$/.exec(textBeforeCaret);

    if (match) {
      const range = document.createRange();
      range.setStart(
        textNode,
        selectionRange.endOffset - match[2].length - 1,
      );
      range.setEnd(textNode, selectionRange.endOffset);
      return range;
    }
  }

  return createTextRange(container, activeMention.start, activeMention.end);
}

export function InternalNoteForm({
  cannedResponses = [],
  currentUserId,
  mentionUsers,
  ticketId,
}: InternalNoteFormProps) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionUsers, setSelectedMentionUsers] = useState<
    MentionUser[]
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();
  const mentionableUsers = useMemo(
    () => mentionUsers.filter((user) => user.id !== currentUserId),
    [currentUserId, mentionUsers],
  );
  const selectedTemplate =
    cannedResponses.find((template) => template.id === selectedTemplateId) ??
    null;
  const suggestions = useMemo(() => {
    if (!activeMention) {
      return [];
    }

    const query = activeMention.query;
    const matches = mentionableUsers.filter((user) =>
      getUserSearchText(user).includes(query),
    );

    return matches.slice(0, 6);
  }, [activeMention, mentionableUsers]);
  const showSuggestions = suggestions.length > 0;

  function updateMentionState() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setActiveMention(findActiveMentionAtCaret(editor));
    setSelectedIndex(0);
  }

  function syncEditorState() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setBody(editor.innerText.replace(/\u00a0/g, " ").trim());
    setBodyHtml(editor.innerHTML);
    updateMentionState();
  }

  function insertMention(user: MentionUser) {
    const editor = editorRef.current;

    if (!activeMention || !editor) {
      return;
    }

    const range = createActiveMentionRangeAtCaret(editor, activeMention);
    const badge = createMentionBadgeElement(user, () => {
      syncEditorState();
      editor.focus();
    });
    const trailingSpace = document.createTextNode(" ");
    const fragment = document.createDocumentFragment();

    fragment.append(badge, trailingSpace);
    range.deleteContents();
    range.insertNode(fragment);
    range.setStartAfter(trailingSpace);
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setSelectedMentionUsers((current) =>
      current.some((selectedUser) => selectedUser.id === user.id)
        ? current
        : [...current, user],
    );
    setActiveMention(null);
    setSelectedIndex(0);
    syncEditorState();
    editor.focus();
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!showSuggestions) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(suggestions[selectedIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveMention(null);
    }
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

  function resetEditor() {
    setActiveMention(null);
    setBody("");
    setBodyHtml("");
    setSelectedMentionUsers([]);
    setSelectedTemplateId("");

    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    syncEditorState();

    if (!editorRef.current?.innerText.trim()) {
      toast({
        variant: "destructive",
        title: "Note body required",
        description: "Write a note before adding it to the timeline.",
      });
      return;
    }

    const formData = new FormData(event.currentTarget);
    const submittedBody = editorRef.current.innerText.trim();
    formData.set("body", submittedBody);
    formData.set("bodyHtml", editorRef.current.innerHTML);

    for (const user of selectedMentionUsers) {
      const handle = getMentionHandle(user);
      const mentionPattern = new RegExp(
        `(^|[^\\w.+-])@${escapeRegExp(handle)}\\b`,
      );

      if (mentionPattern.test(submittedBody)) {
        formData.append("mentionedUserId", user.id);
      }
    }

    startTransition(async () => {
      try {
        await addInternalNote(formData);
        resetEditor();
        toast({
          variant: "success",
          title: "Internal note added",
          description: "Mentioned teammates were notified by email.",
        });
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Note failed",
          description:
            error instanceof Error ? error.message : "The note was not added.",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="bg-white">
          <MessageSquarePlus data-icon="inline-start" />
          Add internal note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add internal note</DialogTitle>
          <DialogDescription>
            Private note for the support team. Use @name to notify a teammate.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="body" value={body} />
          <input type="hidden" name="bodyHtml" value={bodyHtml} />
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <label
                  htmlFor="internalNoteCannedResponse"
                  className="text-sm font-medium text-zinc-950"
                >
                  Templates
                </label>
                <select
                  id="internalNoteCannedResponse"
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
          <div className="flex flex-col gap-2">
            <div
              ref={editorRef}
              role="textbox"
              aria-label="Internal note"
              aria-multiline="true"
              contentEditable
              data-placeholder="Write a private note for the support team."
              className="min-h-36 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-cyan-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
              onBlur={() => {
                window.setTimeout(() => setActiveMention(null), 120);
              }}
              onClick={updateMentionState}
              onInput={syncEditorState}
              onKeyDown={handleKeyDown}
              onKeyUp={updateMentionState}
              onPaste={handlePaste}
            />
            {showSuggestions ? (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-sm">
                {suggestions.map((user, index) => {
                  const handle = getMentionHandle(user);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left",
                        index === selectedIndex
                          ? "bg-zinc-100"
                          : "hover:bg-zinc-50",
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(user);
                      }}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                        <AtSign />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-950">
                          {user.name ?? user.email}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{handle} · {user.email}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
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
              Add note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
