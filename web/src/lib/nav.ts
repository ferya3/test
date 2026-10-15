/**
 * The site's fixed pages. The product groups are added between "home" and
 * "projects" from the database (see components/site/header.tsx), so a new
 * group shows in the menu as soon as it is created.
 */
export const NAV = [
  { key: 'home', href: '/' },
  { key: 'projects', href: '/projects' },
  { key: 'about', href: '/about' },
  { key: 'contact', href: '/contact' },
] as const;

/** A link in the menus: a fixed page or a product group. */
export type NavItem = { href: string; label: string };
