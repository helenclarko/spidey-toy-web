# Spidey Toy (web)

An unofficial, fan-made browser app for the discontinued Sphero *Spider-Man Interactive Super Hero* smart toy,
whose official app and servers are gone. It talks to the toy directly over Bluetooth (Web Bluetooth), no server needed.

**Use it:** open the GitHub Pages site in **Chrome or Edge** (desktop or Android). Web Bluetooth is not available in Firefox or Safari.
Turn the toy on (foot light glowing), press *Connect Smart Toy* and pick the device starting with `ST`.

## Changing the hero name and powers
Settings -> *Your hero's name* -> pick words -> *Save name*. The toy ignores profile changes sent with the account id `0`,
but accepts any other id, so the app sends a generic one (`cust_spideyweb`; change it in *Advanced -> ACC value*, tap the
version line in Settings five times). Check by ear: ask "What's my name?".

## Not affiliated
Not affiliated with, endorsed by, or connected to Marvel, Disney, Sphero or SmartToy. All names and the toy are the
property of their owners. This repo contains no Marvel/Sphero artwork, audio, fonts or app code: the pictures are
generated placeholders in `artwork/` (replace them with your own, keeping the file names). Use at your own risk.

## License
Code: MIT (see LICENSE).
