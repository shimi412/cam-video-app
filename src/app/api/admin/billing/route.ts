import { withAccess } from "@/lib/access";
import { getSetting,setSetting } from "@/lib/settings";
import { paymentsConfigured } from "@/lib/stripe-billing";
import { CustomerPricingSchema } from "@/lib/customer-wallet";
import { smallJson } from "@/lib/http";
export const GET=withAccess(async()=>Response.json({pricing:await getSetting('customer_pricing')??null,paymentsConfigured:paymentsConfigured(),testMode:!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')},{headers:{'Cache-Control':'no-store'}}),'admin');
export const PUT=withAccess(async request=>{const input=CustomerPricingSchema.strict().safeParse(await smallJson(request).catch(()=>null));if(!input.success)return Response.json({error:'Set a markup factor of at least 1 and the actual USD cost per narration-provider credit.'},{status:400});await setSetting('customer_pricing',input.data);return Response.json({ok:true});},'admin');
