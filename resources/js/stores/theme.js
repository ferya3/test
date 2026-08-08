/**
 * Light/dark preference.
 *
 * Three states, matching how the CSS tokens are declared:
 *   'system'  no data-theme attribute, so prefers-color-scheme decides
 *   'light'   data-theme="light"
 *   'dark'    data-theme="dark"
 *
 * The attribute is applied by an inline script in the document head before
 * first paint, so a stored dark preference never flashes a light page. This
 * store only handles changes made after load.
 */
const STORAGE_KEY = 'theme';

export default {
    preference: 'system',

    init() {
        this.preference = this.stored() ?? 'system';
    },

    stored() {
        try {
            const value = window.localStorage.getItem(STORAGE_KEY);

            return ['light', 'dark', 'system'].includes(value) ? value : null;
        } catch {
            // Private browsing modes can throw on localStorage access.
            return null;
        }
    },

    set(preference) {
        this.preference = preference;

        if (preference === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', preference);
        }

        try {
            window.localStorage.setItem(STORAGE_KEY, preference);
        } catch {
            // Preference simply will not persist; the page still works.
        }
    },

    /** True when the page is currently rendering dark, whatever the source. */
    get isDark() {
        if (this.preference === 'dark') {
            return true;
        }

        if (this.preference === 'light') {
            return false;
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    },

    toggle() {
        this.set(this.isDark ? 'light' : 'dark');
    },
};
