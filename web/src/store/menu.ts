import { create } from 'zustand';

type MenuState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

/** The mobile navigation drawer. One store, so the header button and the drawer agree. */
export const useMenu = create<MenuState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
