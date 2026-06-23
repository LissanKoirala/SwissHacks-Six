/** AW logo square in the sidebar brand strip (`Sidebar` → `h-7 w-7`). */
export const DESK_BRAND_MARK_HEIGHT = "h-7";

/**
 * Full sidebar brand strip — AW mark + “Advisory Workbench” title block.
 * Keep `MAIN_CONTENT_TOP_PADDING` in sync (same rem value).
 */
export const DESK_BRAND_STRIP_HEIGHT = "h-[4.5rem]";

/**
 * Top inset for every main pane — matches the sidebar brand strip height so the
 * content begins on the same line as the sidebar nav. Desktop only: below `lg`
 * the sidebar is a drawer and the mobile top bar owns that vertical space instead.
 */
export const MAIN_CONTENT_TOP_PADDING = "lg:pt-[4.5rem]";
