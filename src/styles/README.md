# Legacy design system

`hub.css` remains the base shell and token layer from the original CRM.

`legacy-pipeline.css` is generated from `modules/pipeline.html` and keeps the original Pipeline component styles available to the React migration. Regenerate it with:

```bash
node scripts/extract-legacy-pipeline-css.js
```

Use `src/app/globals.css` only for Next/React adapters or small overrides that cannot live in the legacy source.
