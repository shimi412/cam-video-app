import { stripeClient, settleTopup } from "@/lib/stripe-billing";
import { settleMonthlyInvoice, notifySubscriptionEvent } from "@/lib/stripe-subscription";
export async function POST(request:Request){const secret=process.env.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature");if(!secret||!signature)return new Response("Webhook unavailable",{status:400});let event;try{event=stripeClient().webhooks.constructEvent(await request.text(),signature,secret);}catch{return new Response("Invalid signature",{status:400});}
 try{
  if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded")await settleTopup(event.data.object);
  else if(event.type==="invoice.paid")console.log("stripe invoice.paid:",await settleMonthlyInvoice(event.data.object));
  else if(event.type==="invoice.payment_failed"||event.type==="customer.subscription.deleted")await notifySubscriptionEvent(event);
  return Response.json({received:true});
 }catch(e){console.error("stripe webhook:",e instanceof Error?e.message:e);return new Response("Payment reconciliation pending",{status:500});}}
