"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { str, type ActionResult } from "./common";

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(fd, "email"),
    password: str(fd, "password"),
  });
  if (error) return { error: "Email atau password salah" };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
