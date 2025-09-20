declare module "cross-zip" {
  export function zip(
    src: string,
    dest: string,
    callback: (error: Error | null) => void,
  ): void;
}

declare module "@man-sh/supabase-management-js";
