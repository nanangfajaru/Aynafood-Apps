"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/actions/common";
import { Alert, Button, cn } from "./ui";

type FormAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Form yang menjalankan server action dan menampilkan pesan error/sukses.
 * `confirmText` memunculkan dialog konfirmasi sebelum submit.
 */
export function ActionForm({
  action,
  children,
  confirmText,
  className,
  errorClassName,
}: {
  action: FormAction;
  children: ReactNode;
  confirmText?: string;
  className?: string;
  errorClassName?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && (
        <div className={cn("mt-3 basis-full", errorClassName)}>
          <Alert>{state.error}</Alert>
        </div>
      )}
      {state?.message && !state.error && (
        <div className={cn("mt-3 basis-full", errorClassName)}>
          <Alert tone="green">{state.message}</Alert>
        </div>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText = "Memproses…",
  variant = "primary",
  size,
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** Tombol aksi tunggal (mis. Konfirmasi, Batalkan) dengan konfirmasi opsional. */
export function ActionButton({
  action,
  children,
  confirmText,
  variant = "secondary",
  size,
}: {
  action: FormAction;
  children: ReactNode;
  confirmText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md";
}) {
  return (
    <ActionForm action={action} confirmText={confirmText} className="contents" errorClassName="fixed bottom-4 right-4 z-50 max-w-md">
      <SubmitButton variant={variant} size={size}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
