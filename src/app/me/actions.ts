"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { error?: string; ok?: string };

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser("/me");
  const username = String(formData.get("username") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return { error: "Usernames are 3–24 letters, numbers or underscores." };
  }
  if (bio.length > 500) return { error: "Keep your bio under 500 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ username, bio }).eq("id", user.id);
  if (error?.code === "23505") return { error: "That username is taken." };
  if (error) return { error: "Could not save your profile." };

  revalidatePath("/me");
  return { ok: "Profile saved." };
}
