# GCSEmarker

GCSEmarker is a GCSE practice-marking app for uploaded question scans, exam-board-aware feedback, AO1/AO2/AO3 essay marking, maths/science method marks, official mark-scheme links, a Top Band mode, and subscription tracking.

## Stack
- Vercel for hosting
- GitHub for source control and GitHub Actions packaging
- Supabase for persistence
- Capacitor for iOS wrapper packaging

## Local setup
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## iOS wrapper sync
```bash
npm run cap:sync
```

## Supabase tables
- `marking_sessions`
- `subscriptions`
