import { notFound } from "next/navigation";
import { Code2, Plus } from "lucide-react";

import {
  createSupportForm,
  updateSupportForm,
} from "@/app/(app)/support-forms/actions";
import { DeleteSupportFormButton } from "@/components/app/delete-support-form-button";
import { SupportFormGenerator } from "@/components/app/support-form-generator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireSupportFormManager } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";
import { getSupportAppBaseUrl } from "@/lib/support-email";
import { getSupportFormAllowedOrigins } from "@/lib/support-form";

export const dynamic = "force-dynamic";

type SupportFormRecord = {
  accentColor: string;
  buttonLabel: string;
  embedMode: string;
  id: string;
  intro: string;
  isActive: boolean;
  name: string;
  placement: string;
  successMessage: string;
  title: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  updatedAt: Date;
  _count: {
    tickets: number;
  };
};

function formatDate(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SupportFormFields({
  form,
}: {
  form?: Partial<SupportFormRecord>;
}) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1.5 text-sm md:col-span-2">
        <span className="font-medium text-zinc-900">Internal name</span>
        <Input name="name" defaultValue={form?.name ?? ""} required />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-900">Title</span>
        <Input
          name="title"
          defaultValue={form?.title ?? "Contact support"}
          required
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-900">Button label</span>
        <Input
          name="buttonLabel"
          defaultValue={form?.buttonLabel ?? "Support"}
          required
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm md:col-span-2">
        <span className="font-medium text-zinc-900">Intro text</span>
        <Textarea
          name="intro"
          defaultValue={
            form?.intro ?? "Send a message to our support team."
          }
          rows={3}
          required
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-900">Accent color</span>
        <div className="flex gap-2">
          <Input
            className="w-14 shrink-0 p-1"
            name="accentColor"
            type="color"
            defaultValue={form?.accentColor ?? "#0f766e"}
          />
          <div className="flex h-9 flex-1 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs text-muted-foreground">
            {form?.accentColor ?? "#0f766e"}
          </div>
        </div>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-900">Display mode</span>
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
          name="embedMode"
          defaultValue={form?.embedMode ?? "floating"}
        >
          <option value="floating">Floating button</option>
          <option value="inline">Embedded inline</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-900">Placement</span>
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
          name="placement"
          defaultValue={form?.placement ?? "bottom-right"}
        >
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm md:col-span-2">
        <span className="font-medium text-zinc-900">Success message</span>
        <Input
          name="successMessage"
          defaultValue={
            form?.successMessage ?? "Thanks. We received your request."
          }
          required
        />
      </label>
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
        <label className="flex items-start gap-3 text-sm">
          <input
            name="isActive"
            className="mt-1"
            type="checkbox"
            defaultChecked={form?.isActive ?? true}
          />
          <span>
            <span className="block font-medium text-zinc-900">Active</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Inactive forms keep their saved settings but reject public
              submissions.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            name="turnstileEnabled"
            className="mt-1"
            type="checkbox"
            defaultChecked={form?.turnstileEnabled ?? false}
          />
          <span>
            <span className="block font-medium text-zinc-900">
              Protect with Cloudflare Turnstile CAPTCHA
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Requires `TURNSTILE_SECRET_KEY` in the app environment and a
              Turnstile site key below.
            </span>
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-900">Turnstile site key</span>
          <Input
            name="turnstileSiteKey"
            defaultValue={form?.turnstileSiteKey ?? ""}
            placeholder="0x4AAAA..."
          />
        </label>
      </div>
    </div>
  );
}

export default async function SupportFormsPage() {
  const actor = await requireSupportFormManager();

  if (!actor) {
    notFound();
  }

  const appBaseUrl = getSupportAppBaseUrl();
  const allowedOrigins = getSupportFormAllowedOrigins();
  const turnstileConfigured = Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim(),
  );
  const forms = await prisma.supportForm.findMany({
    orderBy: [
      {
        isActive: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
    include: {
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-cyan-800"
            >
              Embedded support
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
            Support forms
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create and manage JavaScript widgets for customer-facing pages. Form
            submissions create unassigned embedded-form tickets.
          </p>
        </div>
      </div>

      <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Code2 className="size-4" />
            Runtime settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium text-zinc-950">App base URL</div>
              <div className="mt-1 break-words font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {appBaseUrl}
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium text-zinc-950">Allowed origins</div>
              <div className="mt-1 break-words font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {allowedOrigins.length > 0
                  ? allowedOrigins.join(", ")
                  : `${appBaseUrl} only`}
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="font-medium text-zinc-950">CAPTCHA verification</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {turnstileConfigured
                  ? "TURNSTILE_SECRET_KEY is configured."
                  : "Set TURNSTILE_SECRET_KEY before using CAPTCHA-protected forms."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plus className="size-4" />
            New support form
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSupportForm} className="flex flex-col gap-4">
            <SupportFormFields />
            <div className="flex justify-end">
              <Button type="submit">Create form</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-5">
        {forms.map((form) => (
          <Card
            key={form.id}
            className="rounded-lg border-zinc-200 bg-white shadow-sm"
          >
            <CardHeader>
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <CardTitle className="break-words text-base [overflow-wrap:anywhere]">
                    {form.name}
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={form.isActive ? "secondary" : "outline"}>
                      {form.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline">
                      {form.embedMode === "inline" ? "Inline" : "Floating"}
                    </Badge>
                    {form.turnstileEnabled ? (
                      <Badge variant="outline">CAPTCHA</Badge>
                    ) : null}
                    <span>{form._count.tickets} tickets</span>
                    <span>Updated {formatDate(form.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
                <form action={updateSupportForm} className="flex flex-col gap-4">
                  <input type="hidden" name="formId" value={form.id} />
                  <SupportFormFields form={form} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="submit">Save changes</Button>
                  </div>
                </form>
                <div className="min-w-0">
                  <SupportFormGenerator appBaseUrl={appBaseUrl} form={form} />
                  <div className="mt-3 flex justify-end">
                    <DeleteSupportFormButton
                      formId={form.id}
                      formName={form.name}
                      ticketCount={form._count.tickets}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {forms.length === 0 ? (
          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No support forms have been created yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
