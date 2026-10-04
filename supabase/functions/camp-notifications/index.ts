import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const VAPID_PUBLIC = "BF3EVnNKTFBmSHImqA-PpYPylaHMG9L-A-gomiSB20084j_mNWWAT_Gm282-ovE5fXBN6fkPT_QyuXSx4H8r1hI";
const APP_ORIGIN = "https://trastornadores.vercel.app";
const ICON = APP_ORIGIN + "/icons/icon-192.png";
const BADGE = APP_ORIGIN + "/icons/notification-badge.png";
const escapeHtml = (s: string) => String(s || "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c] || c));
const fullUrl = (href: string) => href?.startsWith("http") ? href : APP_ORIGIN + (href || "/campamento/");

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return new Response(JSON.stringify({ ok:false, error:"server_not_configured" }), { status:500, headers:{"content-type":"application/json"} });
  const sb = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });

  const auth = await sb.rpc("tnt_worker_secret", { p_name:"tnt_worker_dispatch" });
  const provided = req.headers.get("authorization") || "";
  if (auth.error || !auth.data || provided !== "Bearer " + auth.data) {
    return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:{"content-type":"application/json"}});
  }
  try { await sb.rpc("tnt_camp_prepare_notifications"); } catch (_) {}

  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const emailFrom = Deno.env.get("TNT_EMAIL_FROM") || "";
  const emailReady = Boolean(resendKey && emailFrom);

  const secretRes = await sb.rpc("tnt_worker_secret", { p_name:"tnt_vapid_private" });
  const vapidPrivate = secretRes.data as string | null;
  if (vapidPrivate) webpush.setVapidDetails("mailto:notificaciones@trastornadores.app", VAPID_PUBLIC, vapidPrivate);

  const claim = await sb.rpc("tnt_camp_claim_outbox", { p_limit:100, p_include_waiting:emailReady });
  if (claim.error) throw claim.error;
  const rows = claim.data || [];
  let sent = 0, skipped = 0, failed = 0, waiting = 0;

  for (const row of rows) {
    try {
      if (row.channel === "push") {
        if (!vapidPrivate) throw new Error("VAPID private key unavailable");
        let subs:any[] = [];
        if (row.registration_id) {
          const r = await sb.from("tnt_camp_push_subscriptions").select("id,endpoint,subscription").eq("registration_id", row.registration_id).eq("active", true);
          if (r.error) throw r.error; subs = r.data || [];
        } else if (row.person_id) {
          const r = await sb.from("tnt_push_subscriptions").select("endpoint,subscription").eq("person_id", row.person_id);
          if (r.error) throw r.error; subs = r.data || [];
        }
        if (!subs.length) {
          await sb.from("tnt_camp_outbox").update({ status:"skipped", locked_at:null, last_error:"No hay un teléfono suscripto" }).eq("id", row.id);
          skipped++; continue;
        }
        let delivered = 0;
        const payload = JSON.stringify({
          title: row.subject || "TNT",
          body: row.body || "Tenés una novedad.",
          tag: `tnt-${row.kind}-${row.registration_id || row.person_id || row.id}`,
          url: fullUrl(row.href),
          icon: ICON,
          badge: BADGE
        });
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub.subscription, payload, { TTL: 60 * 60 * 12, urgency:"normal" as any });
            delivered++;
          } catch (e:any) {
            const status = Number(e?.statusCode || e?.status || 0);
            if (status === 404 || status === 410) {
              if (row.registration_id) await sb.from("tnt_camp_push_subscriptions").update({ active:false }).eq("endpoint", sub.endpoint);
              else await sb.from("tnt_push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }
        if (!delivered) throw new Error("No se pudo entregar a ningún dispositivo");
        await sb.from("tnt_camp_outbox").update({ status:"sent", sent_at:new Date().toISOString(), locked_at:null, last_error:null }).eq("id", row.id);
        sent++; continue;
      }

      if (row.channel === "email") {
        if (!emailReady) {
          await sb.from("tnt_camp_outbox").update({ status:"waiting_provider", locked_at:null, last_error:"Falta configurar RESEND_API_KEY y TNT_EMAIL_FROM" }).eq("id", row.id);
          waiting++; continue;
        }
        if (!row.recipient) {
          await sb.from("tnt_camp_outbox").update({ status:"skipped", locked_at:null, last_error:"Sin email destinatario" }).eq("id", row.id);
          skipped++; continue;
        }
        const target = fullUrl(row.href);
        const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#1f2024"><div style="display:inline-block;background:#ff6a35;color:#fff;font-weight:900;border-radius:14px;padding:10px 14px;margin-bottom:18px">TNT</div><h1 style="font-size:24px">${escapeHtml(row.subject)}</h1><p style="font-size:16px;line-height:1.65;white-space:pre-line">${escapeHtml(row.body)}</p><p style="margin-top:26px"><a href="${escapeHtml(target)}" style="background:#111214;color:#fff;text-decoration:none;border-radius:12px;padding:12px 18px;font-weight:700">Ver mi inscripción</a></p></div>`;
        const mail = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ "authorization":`Bearer ${resendKey}`, "content-type":"application/json" }, body:JSON.stringify({ from:emailFrom, to:[row.recipient], subject:row.subject, html }) });
        if (!mail.ok) throw new Error(`Email ${mail.status}: ${await mail.text()}`);
        await sb.from("tnt_camp_outbox").update({ status:"sent", sent_at:new Date().toISOString(), locked_at:null, last_error:null }).eq("id", row.id);
        sent++; continue;
      }

      await sb.from("tnt_camp_outbox").update({ status:"skipped", locked_at:null, last_error:"Canal no reconocido" }).eq("id", row.id); skipped++;
    } catch (e:any) {
      await sb.from("tnt_camp_outbox").update({ status:"failed", locked_at:null, last_error:String(e?.message || e).slice(0,900) }).eq("id", row.id);
      failed++;
    }
  }


  // Each message/device pair is queued once. Never deliver resolved or dismissed alerts.
  const teamClaim = await sb.rpc("tnt_claim_push", {p_limit:100});
  let teamSent=0,teamSkipped=0,teamFailed=0;
  if (!teamClaim.error) for (const row of teamClaim.data || []) {
    try {
      const subscription = await sb.from("tnt_push_subscriptions").select("subscription")
        .eq("person_id",row.person_id).eq("endpoint",row.endpoint).maybeSingle();
      if (subscription.error) throw subscription.error;
      const account=await sb.from("tnt_accounts").select("enabled,staff_status").eq("person_id",row.person_id).maybeSingle();
      if(account.error)throw account.error;
      let skip = !subscription.data || !account.data || account.data.enabled===false;
      const payload=row.payload||{};
      if (payload.notification_id) {
        const note=await sb.from("tnt_notifications").select("*").eq("id",payload.notification_id).maybeSingle();
        if (note.error) throw note.error;
        if (!note.data) skip=true;
        else {
          const visible=await sb.rpc("tnt_notification_visible_for",{p_note:note.data,p_person:row.person_id});
          if(visible.error)throw visible.error;
          skip ||= !visible.data;
          const resolved=await sb.rpc("tnt_notification_resolved",{p_note:note.data});
          if (resolved.error) throw resolved.error;
          const state=await sb.from("tnt_notification_state").select("read_at,dismissed_at")
            .eq("notification_id",payload.notification_id).eq("person_id",row.person_id).maybeSingle();
          if (state.error) throw state.error;
          skip ||= Boolean(resolved.data || state.data?.dismissed_at || state.data?.read_at || note.data.read_at);
        }
      }
      if (payload.message_id) {
        const message=await sb.from("tnt_chat_messages").select("thread_id,created_at,deleted_at,audience_person_ids")
          .eq("id",payload.message_id).maybeSingle();
        if (message.error) throw message.error;
        if (!message.data || message.data.deleted_at) skip=true;
        else {
          const access=await sb.rpc("tnt_recipient_has_module",{p_person:row.person_id,p_module:"chat"});
          if(access.error)throw access.error;
          skip ||= !access.data;
          const member=await sb.from("tnt_chat_members").select("last_read_at")
            .eq("thread_id",message.data.thread_id).eq("person_id",row.person_id).maybeSingle();
          if (member.error) throw member.error;
          skip ||= account.data?.staff_status!=="approved" || !member.data || Boolean(member.data.last_read_at && member.data.last_read_at>=message.data.created_at)
            || Boolean(message.data.audience_person_ids && !message.data.audience_person_ids.includes(row.person_id));
        }
      }
      if (skip) {
        const saved=await sb.from("tnt_push_outbox").update({status:"skipped",last_error:"Aviso atendido o teléfono desactivado"}).eq("id",row.id);
        if (saved.error) throw saved.error;
        teamSkipped++;continue;
      }
      if (!vapidPrivate) throw new Error("Push is not configured");
      const url = fullUrl(payload.url || "/");
      if (new URL(url).origin !== APP_ORIGIN) throw new Error("Notification target is not part of TNT");
      try {
        await webpush.sendNotification(subscription.data.subscription,JSON.stringify({...payload,url,icon:ICON,badge:BADGE}),{TTL:12*60*60,urgency:"normal"});
      } catch (error: any) {
        if ([404,410].includes(Number(error?.statusCode))) {
          await sb.from("tnt_push_subscriptions").delete().eq("person_id",row.person_id).eq("endpoint",row.endpoint);
          await sb.from("tnt_push_outbox").update({status:"skipped",last_error:"Suscripción vencida"}).eq("id",row.id);
          teamSkipped++;continue;
        }
        throw error;
      }
      const saved=await sb.from("tnt_push_outbox").update({status:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",row.id);
      if (saved.error) throw saved.error;
      teamSent++;
    } catch (error: any) {
      await sb.from("tnt_push_outbox").update({status:"failed",available_at:new Date(Date.now()+60000*row.attempts).toISOString(),last_error:String(error?.message||error).slice(0,300)}).eq("id",row.id);
      teamFailed++;
    }
  }

  return new Response(JSON.stringify({ ok:true, claimed:rows.length, sent, skipped, failed, waiting, team_sent:teamSent, team_skipped:teamSkipped, team_failed:teamFailed, email_ready:emailReady, push_ready:Boolean(vapidPrivate) }), { headers:{ "content-type":"application/json" } });
});

