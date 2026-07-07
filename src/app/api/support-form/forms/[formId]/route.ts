import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  isSupportFormOriginAllowed,
  supportFormCorsHeaders,
} from "@/lib/support-form";

export const dynamic = "force-dynamic";

function jsonResponse(
  origin: string | null,
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  const headers = supportFormCorsHeaders(origin);
  headers.set("Content-Type", "application/json");

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isSupportFormOriginAllowed(origin)) {
    return jsonResponse(
      origin,
      { error: "This origin is not allowed to load support forms." },
      { status: 403 },
    );
  }

  return new Response(null, {
    headers: supportFormCorsHeaders(origin),
    status: 204,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const origin = request.headers.get("origin");

  if (!isSupportFormOriginAllowed(origin)) {
    return jsonResponse(
      origin,
      { error: "This origin is not allowed to load support forms." },
      { status: 403 },
    );
  }

  const { formId } = await params;
  const form = await prisma.supportForm.findUnique({
    where: {
      id: formId,
    },
    select: {
      accentColor: true,
      buttonLabel: true,
      embedMode: true,
      id: true,
      intro: true,
      isActive: true,
      placement: true,
      successMessage: true,
      title: true,
      turnstileEnabled: true,
      turnstileSiteKey: true,
    },
  });

  if (!form || !form.isActive) {
    return jsonResponse(
      origin,
      { error: "Support form is not available." },
      { status: 404 },
    );
  }

  return jsonResponse(origin, {
    accentColor: form.accentColor,
    buttonLabel: form.buttonLabel,
    embedMode: form.embedMode,
    formId: form.id,
    intro: form.intro,
    placement: form.placement,
    successMessage: form.successMessage,
    title: form.title,
    turnstileSiteKey:
      form.turnstileEnabled && form.turnstileSiteKey
        ? form.turnstileSiteKey
        : "",
  });
}
