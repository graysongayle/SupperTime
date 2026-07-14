"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign } from "lucide-react";

import { addInternalNote } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MentionUser = {
  email: string;
  id: string;
  name: string | null;
};

type InternalNoteFormProps = {
  currentUserId: string | null;
  mentionUsers: MentionUser[];
  ticketId: string;
};

type ActiveMention = {
  end: number;
  query: string;
  start: number;
};

function getMentionHandle(user: MentionUser) {
  const localPart = user.email.split("@")[0]?.toLowerCase() ?? "";
  return localPart.replace(/[^a-z0-9._+-]/g, "") || user.email.toLowerCase();
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

export function InternalNoteForm({
  currentUserId,
  mentionUsers,
  ticketId,
}: InternalNoteFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const mentionableUsers = useMemo(
    () => mentionUsers.filter((user) => user.id !== currentUserId),
    [currentUserId, mentionUsers],
  );
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

  function updateMentionState(value: string, caret: number) {
    setActiveMention(findActiveMention(value, caret));
    setSelectedIndex(0);
  }

  function insertMention(user: MentionUser) {
    if (!activeMention) {
      return;
    }

    const mention = `@${getMentionHandle(user)} `;
    const nextBody =
      body.slice(0, activeMention.start) +
      mention +
      body.slice(activeMention.end);
    const nextCaret = activeMention.start + mention.length;

    setBody(nextBody);
    setActiveMention(null);
    setSelectedIndex(0);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextBody = event.target.value;

    setBody(nextBody);
    updateMentionState(nextBody, event.target.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  function handleSelect() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    updateMentionState(textarea.value, textarea.selectionStart);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await addInternalNote(formData);
        setBody("");
        setActiveMention(null);
        form.reset();
        toast({
          variant: "success",
          title: "Internal note added",
          description: "Mentioned teammates were notified by email.",
        });
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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          name="body"
          required
          rows={5}
          value={body}
          placeholder="Write a private note for the support team. Use @name to notify a teammate."
          onBlur={() => {
            window.setTimeout(() => setActiveMention(null), 120);
          }}
          onChange={handleTextChange}
          onClick={handleSelect}
          onKeyDown={handleKeyDown}
          onKeyUp={handleSelect}
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
                    index === selectedIndex ? "bg-zinc-100" : "hover:bg-zinc-50",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user);
                  }}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                    <AtSign className="size-3.5" />
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
      <p className="text-xs text-muted-foreground">
        Type @ and choose a teammate to send them an email notification.
      </p>
      <div className="flex justify-end">
        <Button
          type="submit"
          className="bg-zinc-900 text-white hover:bg-zinc-800"
          disabled={isPending}
        >
          Add note
        </Button>
      </div>
    </form>
  );
}
