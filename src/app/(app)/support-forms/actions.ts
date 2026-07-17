"use server";

import { revalidatePath } from "next/cache";

import { requireSupportFormManager } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

const validPlacements = new Set(["bottom-right", "bottom-left"]);
const validEmbedModes = new Set(["floating", "inline"]);

async function requireManager() {
  const actor = await requireSupportFormManager();

  if (!actor) {
    throw new Error("You do not have permission to manage support forms.");
  }

  return actor;
}

function stringValue(formData: FormData, key: string, fallback = "") {
  const value = String(formData.get(key) ?? "").trim();
  return value || fallback;
}

function optionalStringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

function supportFormData(formData: FormData) {
  const embedMode = stringValue(formData, "embedMode", "floating");
  const hideOnMobile = formData.get("hideOnMobile") === "on";
  const placement = stringValue(formData, "placement", "bottom-right");
  const turnstileEnabled = formData.get("turnstileEnabled") === "on";
  const turnstileSiteKey = optionalStringValue(formData, "turnstileSiteKey");

  if (turnstileEnabled && !turnstileSiteKey) {
    throw new Error("Turnstile site key is required when CAPTCHA is enabled.");
  }

  return {
    accentColor: stringValue(formData, "accentColor", "#0f766e").slice(0, 32),
    buttonLabel: stringValue(formData, "buttonLabel", "Support").slice(0, 80),
    embedMode: validEmbedModes.has(embedMode) ? embedMode : "floating",
    hideOnMobile,
    intro: stringValue(
      formData,
      "intro",
      "Send a message to our support team.",
    ).slice(0, 500),
    isActive: formData.get("isActive") === "on",
    name: stringValue(formData, "name", "Support form").slice(0, 120),
    placement: validPlacements.has(placement) ? placement : "bottom-right",
    successMessage: stringValue(
      formData,
      "successMessage",
      "Thanks. We received your request.",
    ).slice(0, 200),
    title: stringValue(formData, "title", "Contact support").slice(0, 120),
    turnstileEnabled,
    turnstileSiteKey,
  };
}

export async function createSupportForm(formData: FormData) {
  await requireManager();

  await prisma.supportForm.create({
    data: supportFormData(formData),
  });

  revalidatePath("/support-forms");
}

export async function updateSupportForm(formData: FormData) {
  await requireManager();

  const formId = stringValue(formData, "formId");

  if (!formId) {
    throw new Error("Missing support form id.");
  }

  await prisma.supportForm.update({
    where: {
      id: formId,
    },
    data: supportFormData(formData),
  });

  revalidatePath("/support-forms");
}

export async function deleteSupportForm(formData: FormData) {
  await requireManager();

  const formId = stringValue(formData, "formId");

  if (!formId) {
    throw new Error("Missing support form id.");
  }

  await prisma.supportForm.delete({
    where: {
      id: formId,
    },
  });

  revalidatePath("/support-forms");

  return {
    ok: true,
    message: "Support form deleted.",
  };
}
