import Script from "next/script";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSupportAppBaseUrl } from "@/lib/support-email";

export const dynamic = "force-dynamic";

export default async function SupportFormPreviewPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const form = await prisma.supportForm.findUnique({
    where: {
      id: formId,
    },
    select: {
      embedMode: true,
      isActive: true,
      name: true,
    },
  });

  if (!form) {
    notFound();
  }

  const appBaseUrl = getSupportAppBaseUrl();
  const widgetUrl = new URL(`${appBaseUrl}/api/support-form/widget.js`);
  widgetUrl.searchParams.set("form", formId);
  const inlineTargetId = `suppertime-support-form-${formId}`;

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-6 py-10 text-zinc-950">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
            Support form preview
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{form.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            This page loads the same embedded widget script that an external
            site would use. Test config loading, CAPTCHA, and ticket creation
            from the rendered form.
          </p>
          {!form.isActive ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This form is inactive, so public submissions should be rejected.
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Sample content</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {form.embedMode === "inline"
                ? "The form should render inside the page content below."
                : form.embedMode === "external-trigger"
                  ? "Use the preview button below to open the modal from a host-controlled trigger."
                  : "The widget should float above this page without affecting the surrounding layout."}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Generated script</h2>
            <p className="mt-2 break-words font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {widgetUrl.toString()}
            </p>
          </div>
        </div>
        {form.embedMode === "inline" ? (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div id={inlineTargetId} />
          </div>
        ) : null}
        {form.embedMode === "external-trigger" ? (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <button
              id="preview-open-support-form"
              type="button"
              className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
            >
              Open support form
            </button>
          </div>
        ) : null}
      </div>
      <Script
        src={widgetUrl.toString()}
        data-target={form.embedMode === "inline" ? inlineTargetId : undefined}
        strategy="afterInteractive"
      />
      {form.embedMode === "external-trigger" ? (
        <Script id={`support-form-preview-trigger-${formId}`} strategy="afterInteractive">
          {`
            document
              .getElementById("preview-open-support-form")
              ?.addEventListener("click", function () {
                window.SuppertimeSupportForms?.[${JSON.stringify(formId)}]?.open();
              });
          `}
        </Script>
      ) : null}
    </main>
  );
}
