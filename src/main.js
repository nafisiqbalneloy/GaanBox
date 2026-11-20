import { initTheme } from './theme.js';
import { initCollection } from './collection.js';
import { initCommunity } from './community.js';
import { initAccount } from './account.js';

initTheme();

let collection;
let account;
const community = initCommunity({ onSavedToMine: () => collection.refresh(), getUser: () => account && account.user });
account = initAccount({ onChange: () => community.reload() }); // refresh "mine" markers when signing in/out
collection = initCollection({ onShare: song => community.shareToCommunity(song) });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ });
  });
}
