# Little Kitchen Book

A pink recipe book for your phone and PC. Your PC keeps the recipes, and your phone syncs with it over your home Wi-Fi. Nothing goes to any online service.

## Set it up on your PC (once)

1. Install **Node.js** (the LTS version) from https://nodejs.org.
2. Download this folder: on GitHub, click **Code**, then **Download ZIP**, and unzip it somewhere you'll keep it, like Documents.
3. Double-click **Start Kitchen Book.bat**. If Windows asks about the firewall, tick **Private networks** and click **Allow**.
4. The window shows two addresses and a 6-digit **sync code**. Keep the window open while you want to sync.

## Use it

- **On the PC:** open http://localhost:8787
- **On your phone:** connect to the same Wi-Fi, open the "On your phone" address from the window in Safari, and type the sync code at the bottom of the page. Then tap **Share**, then **Add to Home Screen**.

## Good to know

- Each device keeps its own copy. If the PC is off or you're away from home, the phone still works and catches up next time you're home with the PC on.
- The phone loads the book from your PC, so away from home Wi-Fi it only opens if it's still open in the background. The online copy at https://benjamin-matutina.github.io/little-kitchen-book/ always opens, but it doesn't sync.
- Your recipes are in the `data` folder next to this file. Copy that folder somewhere safe now and then as a backup.
