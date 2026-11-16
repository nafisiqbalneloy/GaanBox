import { initTheme } from './theme.js';
import { initCollection } from './collection.js';
import { initCommunity } from './community.js';

initTheme();

let collection;
const community = initCommunity({ onSavedToMine: () => collection.refresh() });
collection = initCollection({ onShare: song => community.shareToCommunity(song) });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ });
  });
}
