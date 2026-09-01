"use client";
import Link from "next/link";
import { useAppPreferences } from "@/components/app-providers";
import { DashboardHeader } from "@/components/dashboard-header";
import { AcceptInviteButton } from "./accept-invite-button";

type Item={id:string;role:string;status:string;cinemas:{id:string;name:string;status:string}|null};
const statusMap={approved:["Approved","معتمدة"],pending_review:["Pending review","قيد المراجعة"],rejected:["Rejected","مرفوضة"],suspended:["Suspended","موقوفة"]} as const;

export function DashboardHomeView({active,invited}:{active:Item[];invited:Item[]}){
 const {locale}=useAppPreferences(); const ar=locale==="ar";
 const t=ar?{eyebrow:"مساحة العمل",title:"مرحبًا بك في Moviera",intro:"تابع دور السينما التي تعمل معها وانتقل إلى مهامك اليومية.",invites:"الدعوات المعلّقة",invitesNote:"تحتاج هذه الدعوات إلى موافقتك قبل منح الوصول.",cinemas:"دور السينما",count:"عضوية نشطة",empty:"لا تدير أي سينما حتى الآن.",register:"تسجيل سينما جديدة",open:"فتح لوحة التحكم",role:"الدور"}:{eyebrow:"Workspace",title:"Welcome to Moviera",intro:"Keep track of the cinemas you work with and move into your daily tasks.",invites:"Pending invitations",invitesNote:"These invitations need your approval before access is activated.",cinemas:"Your cinemas",count:"active memberships",empty:"You don’t manage any cinemas yet.",register:"Register a new cinema",open:"Open dashboard",role:"Role"};
 const status=(value:string)=>{const pair=statusMap[value as keyof typeof statusMap];return pair?(ar?pair[1]:pair[0]):value.replaceAll("_"," ")};
 return <div className="dashboard-page"><DashboardHeader/><main className="dashboard-main"><section className="page-heading"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p></div><Link className="primary-button" href="/dashboard/register">＋ {t.register}</Link></section>
 {invited.length>0&&<section className="dashboard-section"><div className="section-heading"><div><h2>{t.invites}</h2><p>{t.invitesNote}</p></div><span className="count-badge">{invited.length}</span></div><div className="invite-list">{invited.map(m=><article className="invite-card" key={m.id}><div className="cinema-avatar">{m.cinemas?.name?.charAt(0)??"M"}</div><div className="invite-copy"><h3>{m.cinemas?.name??"Unknown cinema"}</h3><p>{t.role}: <strong>{m.role}</strong></p></div><AcceptInviteButton staffId={m.id}/></article>)}</div></section>}
 <section className="dashboard-section"><div className="section-heading"><div><h2>{t.cinemas}</h2><p>{active.length} {t.count}</p></div></div>{active.length===0?<div className="empty-state"><div className="empty-icon">M</div><h3>{t.empty}</h3><Link className="text-link" href="/dashboard/register">{t.register} →</Link></div>:<div className="cinema-grid">{active.map(m=><Link className="cinema-card" href={`/dashboard/${m.cinemas?.id}`} key={m.id}><div className="cinema-card-top"><div className="cinema-avatar large">{m.cinemas?.name?.charAt(0)??"M"}</div><span className={`status-badge status-${m.cinemas?.status}`}>{status(m.cinemas?.status??"")}</span></div><div><h3>{m.cinemas?.name}</h3><p>{t.role}: {m.role}</p></div><span className="card-link">{t.open} →</span></Link>)}</div>}</section>
 </main></div>;
}
