# Village Verdict

Village Verdict is a Reddit-native social deduction game built on Devvit.

How it works:
- Players join a lobby.
- Everyone receives a secret word.
- One player receives a similar but different word.
- Players discuss in the Reddit comments.
- Everyone votes.
- Results are revealed.
- A new round begins automatically.

Tech Stack:
- Devvit
- Phaser
- TypeScript
- Hono
- tRPC
- Redis

## Devvit Phaser Starter

A starter to build web applications on Reddit's developer platform

- [Devvit](https://developers.reddit.com/): A way to build and deploy immersive games on Reddit
- [Vite](https://vite.dev/): For compiling the webView
- [Phaser](https://phaser.io/): 2D game engine
- [Hono](https://hono.dev/): For backend logic
- [TypeScript](https://www.typescriptlang.org/): For type safety

## Getting Started

> Make sure you have Node 22 downloaded on your machine before running!

1. Run `npm create devvit@latest --template=phaser`
2. Go through the installation wizard. You will need to create a Reddit account and connect it to Reddit developers
3. Copy the command on the success page into your terminal

## Commands

- `npm run dev`: Starts a development server where you can develop your application live on Reddit.
- `npm run build`: Builds your client and server projects
- `npm run deploy`: Uploads a new version of your app
- `npm run launch`: Publishes your app for review
- `npm run login`: Logs your CLI into Reddit
- `npm run type-check`: Type checks, lints, and prettifies your app

## Credits

Thanks to the Phaser team for [providing a great template](https://github.com/phaserjs/template-vite-ts)!
