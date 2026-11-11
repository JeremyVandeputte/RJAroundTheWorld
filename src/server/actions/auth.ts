"use server";

import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { messages } from "@/lib/messages";
import { clearSession, getClientIp, getCurrentUser, setSessionCookie } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { changeOwnPassword, login } from "@/server/services/auth";
import { formString, type FormState } from "./form-state";

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const username = formString(formData, "username");
  const password = formString(formData, "password");
  if (!username.trim() || !password) return { error: messages.login.missing_fields };

  const result = await login(getDb(), getEnv(), { username, password, ip: await getClientIp() });
  if (!result.ok) {
    return {
      error:
        result.reason === "rate_limited"
          ? messages.rateLimited(result.retryAfterMs)
          : messages.login.invalid_credentials,
    };
  }

  await setSessionCookie(result.session.token);
  redirect(result.user.mustChangePassword ? "/profile" : "/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const currentPassword = formString(formData, "currentPassword");
  const newPassword = formString(formData, "newPassword");
  const confirmation = formString(formData, "confirmation");
  if (!currentPassword || !newPassword || !confirmation) return { error: messages.password.missing_fields };

  const result = await changeOwnPassword(getDb(), getEnv(), user.id, {
    currentPassword,
    newPassword,
    confirmation,
    ip: await getClientIp(),
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "rate_limited" ? messages.rateLimited(result.retryAfterMs) : messages.password[result.reason],
    };
  }

  // Every session was revoked: keep this device logged in with the new one.
  await setSessionCookie(result.session.token);
  if (user.mustChangePassword) redirect("/");
  return { success: messages.password.changed };
}
