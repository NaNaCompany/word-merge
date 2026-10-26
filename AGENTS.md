# App maintenance

Keep this repository independent of the legacy merge_pdf and qr apps. All file and QR processing must stay in the browser. Never send file contents, file names, or QR input values to analytics. Preserve the publisher integrations and the subtle More Apps link. Keep vendor dependencies pinned with their license notices. Run core tests and browser QA before publishing; verify the actual downloaded outputs. Keep the Korean title, useful guidance, canonical URL and sitemap aligned with the app.


Language sources are `content/index.ko.html`, `content/locales.json`, and `scripts/build_locales.py`. Rebuild all nine pages instead of editing generated HTML. Preserve root Korean and footer language links. Run locale checks and ensure all error/status messages use AppI18n.
