# GCSEmarker

GCSEmarker is a mobile-ready GCSE marking app with:

- image uploads / scan previews for questions
- exam board selection: AQA, Edexcel, OCR
- essay marking with AO1 / AO2 / AO3 feedback
- maths and science marking with method-mark hints
- official mark scheme links
- Top Band mode for grade 9 improvement
- subscription-ready checkout flow with Supabase-backed history
- Capacitor wrapper config for mobile packaging

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Capacitor wrapper

```bash
npm run cap:sync
```

## Environment variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PAYMENT_LINK`
