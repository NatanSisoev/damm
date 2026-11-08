// Testing-only switch between the full HR portal and the manager view (dashboard only).
// Not access control: the cookie is set from a button in the sidebar and anyone with the HR code can flip it.

export const VIEW_ROLE_COOKIE = "hr_view_role";

export type ViewRole = "hr" | "manager";

/** Paths a manager keeps under /hr: the dashboard, its results subpages and the methodology page. */
export const MANAGER_PATHS = ["/hr/results", "/hr/methodology"];

export const managerAllowed = (path: string): boolean =>
  path === "/hr" || MANAGER_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

export const parseRole = (v: string | undefined): ViewRole => (v === "manager" ? "manager" : "hr");
