# GCSEmarker

GCSEmarker is a Vercel-ready GCSE marking app with:

- OCR image reading for scanned questions
- exam board selection for AQA, Edexcel, and OCR
- essay marking with AO1 / AO2 / AO3 feedback
- maths and science marking with method-mark style feedback
- official mark-scheme links
- Top Band mode for grade 9 improvement guidance
- subscription capture with Stripe-link support and Supabase storage
- Capacitor packaging support for mobile wrapping

## Stack

- Vite + React
- Supabase for storage
- Vercel deployment
- Capacitor wrapper flow
- GitHub Actions packaging workflow

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run cap:sync`

## Notes

The app expects Supabase tables named `marking_sessions` and `subscriptions`.
The included migration enables public insert/select policies for the demo flow.
