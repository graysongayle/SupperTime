"use client";

import { FileText, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { CannedResponseForm } from "@/components/app/canned-response-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CannedResponse = {
  id: string;
  title: string;
  body: string;
  bodyHtml: string | null;
};

type CannedResponseManagerProps = {
  templates: CannedResponse[];
};

function getTemplatePreview(template: CannedResponse) {
  return template.body.replace(/\s+/g, " ").trim() || "No body text";
}

export function CannedResponseManager({
  templates,
}: CannedResponseManagerProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const isCreating = !selectedTemplate;

  return (
    <div className="grid min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-zinc-200 bg-zinc-50/70 xl:border-r xl:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-950">Templates</div>
            <div className="text-xs text-muted-foreground">
              {templates.length} saved
            </div>
          </div>
          <Button
            type="button"
            variant={isCreating ? "secondary" : "outline"}
            size="sm"
            className="bg-white"
            onClick={() => setSelectedTemplateId(null)}
          >
            <Plus data-icon="inline-start" />
            New
          </Button>
        </div>

        {templates.length > 0 ? (
          <div className="flex max-h-[calc(100vh-18rem)] min-w-0 flex-col overflow-y-auto p-2">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId;

              return (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-col gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-white",
                    isSelected &&
                      "bg-white shadow-xs ring-1 ring-zinc-200 hover:bg-white",
                  )}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-cyan-700" />
                    <span className="truncate font-medium text-zinc-950">
                      {template.title}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {getTemplatePreview(template)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            No templates yet.
          </div>
        )}
      </aside>

      <section className="min-w-0">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-950">
              {isCreating ? "New template" : selectedTemplate.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {isCreating ? "Create a reusable reply" : "Edit saved response"}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            Per user
          </Badge>
        </div>
        <div className="p-4 md:p-5">
          <CannedResponseForm
            key={selectedTemplate?.id ?? "new-template"}
            template={selectedTemplate ?? undefined}
          />
        </div>
      </section>
    </div>
  );
}
