import Alpine from 'alpinejs';
import collapse from '@alpinejs/collapse';
import focus from '@alpinejs/focus';

import theme from './stores/theme';
import compare from './stores/compare';

/*
 * Alpine is used for progressive enhancement only. Every component below
 * degrades to working HTML with JavaScript disabled: disclosure panels stay
 * open, navigation remains a list of links, and forms still submit.
 */

Alpine.plugin(collapse);
Alpine.plugin(focus);

Alpine.store('theme', theme);
Alpine.store('compare', compare);

window.Alpine = Alpine;

Alpine.start();
