import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
            // The skeleton's bunny() font helper is deliberately not used: fonts
            // are self-hosted from public/fonts so no third-party origin needs
            // to appear in the Content Security Policy and no extra DNS lookup
            // sits in front of the largest contentful paint.
        }),
        tailwindcss(),
    ],
    // app.css is already a single entry, so it emits one hashed stylesheet
    // without needing build.cssCodeSplit (which Vite 8 rejects alongside a CSS
    // entry point anyway).
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
