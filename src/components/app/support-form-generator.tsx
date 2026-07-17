"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type SupportFormGeneratorProps = {
  appBaseUrl: string;
  form: {
    accentColor: string;
    buttonLabel: string;
    embedMode: string;
    hideOnMobile: boolean;
    id: string;
    intro: string;
    placement: string;
    successMessage: string;
    title: string;
    turnstileEnabled: boolean;
    turnstileSiteKey: string | null;
  };
};

export function SupportFormGenerator({
  appBaseUrl,
  form,
}: SupportFormGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => {
    const widgetUrl = new URL(`${appBaseUrl}/api/support-form/widget.js`);
    widgetUrl.searchParams.set("form", form.id);

    if (form.embedMode === "inline") {
      const targetId = `suppertime-support-form-${form.id}`;

      return `<div id="${targetId}"></div>\n<script src="${widgetUrl.toString()}" data-target="${targetId}" async defer></script>`;
    }

    return `<script src="${widgetUrl.toString()}" data-hide-on-mobile="${String(form.hideOnMobile)}" async defer></script>`;
  }, [appBaseUrl, form.embedMode, form.hideOnMobile, form.id]);
  const previewHref = `/support-form-preview/${form.id}`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Embed code</CardTitle>
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={previewHref} target="_blank">
              Open preview
            </Link>
          </Button>
          <Button type="button" size="sm" onClick={copySnippet}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea readOnly value={snippet} className="min-h-24 font-mono text-xs" />
      </CardContent>
    </Card>
  );
}
