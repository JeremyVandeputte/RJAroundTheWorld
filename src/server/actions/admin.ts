"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { messages } from "@/lib/messages";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import {
  adminCreateUser,
  deleteUser,
  forcePasswordChange,
  resetUserPassword,
  setUserActive,
  updateUserPermissions,
  type UserPermissions,
} from "@/server/services/admin";
import { formBoolean, formId, formString, type FormState } from "./form-state";

// Thin wrappers: permissions are enforced by the services, for every call.

type AdminIssue = keyof typeof messages.admin | keyof typeof messages.user | keyof typeof messages.password;

function describe(reason: string): string {
  const texts: Record<string, unknown> = { ...messages.password, ...messages.user, ...messages.admin };
  const text = texts[reason as AdminIssue];
  return typeof text === "string" ? text : messages.admin.forbidden;
}

function refreshAdminPages(): void {
  revalidatePath("/", "layout");
}

function readPermissions(formData: FormData): UserPermissions {
  return {
    canPublish: formBoolean(formData, "canPublish"),
    canManageTrips: formBoolean(formData, "canManageTrips"),
  };
}

export async function createUserAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const username = formString(formData, "username");
  const displayName = formString(formData, "displayName");
  const result = await adminCreateUser(getDb(), await getCurrentUser(), {
    username,
    displayName,
    ...readPermissions(formData),
  });
  if (!result.ok) return { error: describe(result.reason), values: { username, displayName } };

  refreshAdminPages();
  return {
    success: messages.admin.account_created(result.user.username),
    temporaryPassword: { username: result.user.username, password: result.temporaryPassword },
  };
}

export async function updatePermissionsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = formId(formData, "userId");
  if (userId === null) return { error: messages.user.user_not_found };
  const result = updateUserPermissions(getDb(), await getCurrentUser(), userId, readPermissions(formData));
  if (!result.ok) return { error: describe(result.reason) };
  refreshAdminPages();
  return { success: messages.admin.permissions_saved };
}

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = formId(formData, "userId");
  if (userId === null) return { error: messages.user.user_not_found };
  const result = await resetUserPassword(getDb(), await getCurrentUser(), userId);
  if (!result.ok) return { error: describe(result.reason) };
  refreshAdminPages();
  return {
    success: messages.admin.password_reset,
    temporaryPassword: { username: result.username, password: result.temporaryPassword },
  };
}

export async function forcePasswordChangeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = formId(formData, "userId");
  if (userId === null) return { error: messages.user.user_not_found };
  const result = forcePasswordChange(getDb(), await getCurrentUser(), userId);
  if (!result.ok) return { error: describe(result.reason) };
  refreshAdminPages();
  return { success: messages.admin.change_forced };
}

export async function setActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = formId(formData, "userId");
  if (userId === null) return { error: messages.user.user_not_found };
  const isActive = formString(formData, "isActive") === "true";
  const result = setUserActive(getDb(), await getCurrentUser(), userId, isActive);
  if (!result.ok) return { error: describe(result.reason) };
  refreshAdminPages();
  return { success: isActive ? messages.admin.account_reactivated : messages.admin.account_deactivated };
}

export async function deleteUserAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = formId(formData, "userId");
  if (userId === null) return { error: messages.user.user_not_found };
  const result = deleteUser(getDb(), await getCurrentUser(), userId);
  if (!result.ok) return { error: describe(result.reason) };
  refreshAdminPages();
  redirect("/admin");
}
