/**
 * Product comparison tray.
 *
 * Holds only product slugs in localStorage; the comparison page fetches the
 * actual records server-side, so nothing about a product is trusted from
 * client storage.
 */
const STORAGE_KEY = 'compare';
const LIMIT = 4;

export default {
    slugs: [],

    init() {
        this.slugs = this.read();

        // Keep multiple open tabs in step.
        window.addEventListener('storage', (event) => {
            if (event.key === STORAGE_KEY) {
                this.slugs = this.read();
            }
        });
    },

    read() {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');

            return Array.isArray(parsed)
                ? parsed.filter((slug) => typeof slug === 'string').slice(0, LIMIT)
                : [];
        } catch {
            return [];
        }
    },

    persist() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slugs));
        } catch {
            // Comparison is a convenience; failing to persist is not fatal.
        }
    },

    has(slug) {
        return this.slugs.includes(slug);
    },

    get count() {
        return this.slugs.length;
    },

    get isFull() {
        return this.slugs.length >= LIMIT;
    },

    get limit() {
        return LIMIT;
    },

    add(slug) {
        if (this.has(slug) || this.isFull) {
            return false;
        }

        this.slugs.push(slug);
        this.persist();

        return true;
    },

    remove(slug) {
        this.slugs = this.slugs.filter((entry) => entry !== slug);
        this.persist();
    },

    /** Returns true when the product ended up in the tray. */
    toggle(slug) {
        if (this.has(slug)) {
            this.remove(slug);

            return false;
        }

        return this.add(slug);
    },

    clear() {
        this.slugs = [];
        this.persist();
    },
};
