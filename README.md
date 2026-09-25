# my-website

A starter personal website built with [Astro](https://astro.build) and deployed to GitHub Pages.

**Live site:** https://bendari500-design.github.io/my-website/

## Getting started

### 1. Clone and open in Cursor

```bash
git clone https://github.com/bendari500-design/my-website.git
cd my-website
cursor .
```

(Or open Cursor → **File → Open Folder…** and pick the cloned folder. The project rules in `.cursor/rules/project.mdc` give Cursor's AI context about the project.)

### 2. Install dependencies

Requires Node.js **22.12 or newer**.

```bash
npm install
```

### 3. Run the dev server

```bash
npm run dev
```

Open the URL it prints (http://localhost:4321/my-website/). Changes reload automatically.

### 4. Edit your content

Open `src/pages/index.astro` and edit the `site` object at the top (look for `✏️ EDIT ME`) — name, tagline, intro, buttons, feature cards, and footer links. Theme colors are CSS variables in `src/layouts/Layout.astro`.

### 5. Deploy

```bash
npm run build   # make sure it builds
git add -A
git commit -m "Update site"
git push origin main
```

Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages. Watch progress in the repo's **Actions** tab.

## Project structure

```
├── .github/workflows/deploy.yml   # GitHub Pages deploy
├── .cursor/rules/project.mdc      # Cursor AI project rules
├── public/                        # static assets (favicons, images, CNAME)
├── src/
│   ├── layouts/Layout.astro       # shared HTML shell + global styles
│   └── pages/index.astro          # landing page
└── astro.config.mjs               # site + base config
```

## Commands

| Command           | Action                                      |
| ----------------- | ------------------------------------------- |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start local dev server at `localhost:4321`  |
| `npm run build`   | Build the production site to `./dist/`      |
| `npm run preview` | Preview the build locally                   |

## Notes

- **Internal links:** the site is served from `/my-website/`, so always prefix internal links with `import.meta.env.BASE_URL`.
- **Renaming the repo:** update `base` in `astro.config.mjs` to the new name.
- **Custom domain:** add a `public/CNAME` file containing your domain (e.g. `www.example.com`), configure DNS with your provider, set `site: 'https://www.example.com'` and remove `base` in `astro.config.mjs`, then set the domain under the repo's **Settings → Pages**. See the [Astro docs](https://docs.astro.build/en/guides/deploy/github/#change-your-github-url-to-a-custom-domain).
