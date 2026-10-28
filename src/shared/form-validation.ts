import { revalidateLogic } from "@tanstack/react-form";

/**
 * Validation timing shared by every form: validate on the first submit, then on every change,
 * so fixed fields clear their message and still-wrong ones keep it.
 */
export const REVALIDATE_AFTER_SUBMIT = revalidateLogic();
