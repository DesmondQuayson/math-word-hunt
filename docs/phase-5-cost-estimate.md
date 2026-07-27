# Phase 5 hosted-preview cost estimate

Estimate date: 2026-07-27. Prices, taxes, regions, usage, plan eligibility, and provider terms can change. The owner must verify the checkout quote and set spend controls before creating anything.

| Item | Planning estimate | Important constraint |
|---|---:|---|
| Vercel Hobby | $0/month if eligible | Official pricing describes Hobby as personal/non-commercial; a controlled product pilot should budget for Pro unless the owner confirms eligibility. |
| Vercel Pro | $20/month platform fee for one included deploying seat, plus usage beyond credit | Standard preview protection with Vercel Authentication is available on all plans. Password/advanced protection can add $150/month and is not proposed. |
| Supabase Free | $0/month within limits | Two active projects maximum; free projects can pause after one inactive week; no downloadable provider backups. |
| Supabase Pro | From $25/month | One default project is covered by compute credits; extra projects and usage can add cost. Preview branches incur usage and are not proposed. |
| Stripe Sandbox/test mode | $0 real-payment processing in this phase | Testing simulates objects and moves no money. No live mode, real card, or paid product is authorized. |
| Email capture | $0 with captured logs/local-safe mechanism | External sandbox provider and its price remain an owner decision. Real delivery is disabled. |
| Monitoring | $0 using structured captured logs | A hosted vendor is optional and not approved. Retention/storage can create costs later. |
| DNS/domain | $0 in Phase 5 | Use the protected provider preview hostname; no domain purchase or DNS change. |

Expected recurring total is **$0/month only if all providers permit the intended pilot on free tiers**. The conservative paid pilot floor is approximately **$45/month plus usage, taxes, and any provider add-ons** (Vercel Pro $20 + Supabase Pro $25). Advanced Vercel password protection would materially raise this and is not recommended; Standard Protection with Vercel Authentication is the proposed control.

Official references: [Vercel pricing](https://vercel.com/pricing), [Vercel Pro pricing](https://vercel.com/docs/plans/pro-plan), [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), [Supabase pricing](https://supabase.com/pricing), [Supabase branching costs](https://supabase.com/docs/guides/platform/manage-your-usage/branching), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), and [Stripe testing environments](https://docs.stripe.com/testing-use-cases).
