import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { api } from "./api.js";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FABRICS = ["Jersey 30/1","Jersey 24/1","Interlock","Frisa","Rústica","Lycra","Piqué","Denim","Gabardina","Lino"];
const STAGES = [
  { id:"comprar_tela",  label:"Comprar Tela",  short:"Tela",    color:"#a78bfa" },
  { id:"tela_en_corte", label:"Tela en Corte", short:"Corte",   color:"#60a5fa" },
  { id:"confeccion",    label:"Confección",    short:"Confec.", color:"#fbbf24" },
  { id:"estampado",     label:"Estampado",     short:"Estampa", color:"#fb923c" },
  { id:"finishing",     label:"Finishing",     short:"Finish",  color:"#f472b6" },
  { id:"terminado",     label:"Terminado",     short:"✓ Listo", color:"#34d399" },
];
const STAGE_TASKS = {
  comprar_tela:[
    {id:"ct1",text:"Calcular metraje necesario según cantidad y peso de prendas"},
    {id:"ct2",text:"Cotizar tela con proveedor"},
    {id:"ct3",text:"Pagar la tela"},
    {id:"ct4",text:"Coordinar envío / retiro de tela al taller"},
    {id:"ct5",text:"Confirmar recepción de tela en taller"},
  ],
  tela_en_corte:[
    {id:"tc1",text:"Anotar fecha de inicio de corte"},
    {id:"tc2",text:"Confirmar moldes con el cortador"},
    {id:"tc3",text:"Verificar separaciones por talle y color"},
    {id:"tc4",text:"Anotar fecha estimada de fin de corte"},
    {id:"tc5",text:"Hacer seguimiento con el taller"},
  ],
  confeccion:[
    {id:"co1",text:"Anotar fecha de inicio de confección"},
    {id:"co2",text:"Coordinar entrega de tela cortada al confeccionista"},
    {id:"co3",text:"Coordinar con estampador (si va antes de confección)"},
    {id:"co4",text:"Pagar corte y confección"},
    {id:"co5",text:"Anotar fecha estimada de fin de confección"},
  ],
  estampado:[
    {id:"es1",text:"Enviar arte finalizado al estampador"},
    {id:"es2",text:"Coordinar fecha de entrega al estampador"},
    {id:"es3",text:"Confirmar tipo de estampa (serigrafía, DTG, bordado, etc.)"},
    {id:"es4",text:"Anotar fecha estimada de fin de estampado"},
    {id:"es5",text:"Coordinar finishing post-estampa"},
    {id:"es6",text:"Pagar estampado"},
  ],
  finishing:[
    {id:"fi1",text:"Controlar calidad prenda por prenda"},
    {id:"fi2",text:"Verificar talles y colores contra orden"},
    {id:"fi3",text:"Planchar / vaporizar si corresponde"},
    {id:"fi4",text:"Colocar etiquetas y hangtags"},
    {id:"fi5",text:"Pagar finishing"},
    {id:"fi6",text:"Embalar y organizar por modelo/color/talle"},
  ],
  terminado:[
    {id:"te1",text:"Contar stock final y cruzar con orden"},
    {id:"te2",text:"Fotografía de producto"},
    {id:"te3",text:"Cargar en sistema de inventario"},
    {id:"te4",text:"Registrar costo total real de la producción"},
    {id:"te5",text:"Archivar documentación de la producción"},
  ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function gid(){ return Math.random().toString(36).substr(2,9); }
function stageOf(id){ return STAGES.find(s=>s.id===id)||STAGES[0]; }
function daysLeft(d){ if(!d) return null; return Math.ceil((new Date(d)-new Date())/86400000); }
function fmtDate(d){ if(!d) return "—"; return new Date(d+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}); }
function unitCostOf(c){ return Object.values(c).reduce((a,v)=>a+Number(v),0); }
function totalUnitsOf(models){ return (models||[]).reduce((a,m)=>a+(m.variants||[]).reduce((b,v)=>b+(+v.qty||0),0),0); }
function newVariant(){ return {id:gid(),color:"",stamp:"",size:"",qty:0}; }
function newModel(name=""){ return {id:gid(),name,variants:[newVariant()]}; }
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg:"#080808", panel:"#0e0e0e", panelB:"#0b0b0b",
  border:"#1e1e1e", border2:"#272727",
  text:"#e8dfd2", textSub:"#a09080", muted:"#585858",
  gold:"#d4a843", goldL:"#f0c96a",
  green:"#34d399", red:"#f87171", amber:"#fbbf24",
};

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GCS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Mono:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{min-height:100%;background:${C.bg};-webkit-tap-highlight-color:transparent;}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:3px}
.hov{transition:border-color .2s,transform .15s;cursor:pointer;}
.hov:hover{border-color:#363636!important;transform:translateY(-1px);}
.hov-row{transition:background .15s;cursor:pointer;}
.hov-row:hover{background:#141414;}
.task-row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #151515;cursor:pointer;transition:background .15s;}
.task-row:last-child{border-bottom:none;}
.task-row:active{background:#111;}
@media(hover:hover){.task-row:hover{background:#111;margin:0 -20px;padding-left:20px;padding-right:20px;}}
.chk{width:20px;height:20px;border:1.5px solid #333;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;transition:all .2s;border-radius:2px;}
.chk.done{background:${C.gold};border-color:${C.gold};}
.pbg{height:3px;background:#191919;width:100%;}
.pfill{height:3px;transition:width .5s ease;}
.inp{background:#070707;border:1px solid #232323;color:${C.text};padding:13px 14px;width:100%;font-size:15px;font-family:'DM Mono',monospace;outline:none;transition:border-color .2s;-webkit-appearance:none;border-radius:0;}
.inp:focus{border-color:#404040;}
.inp::placeholder{color:#252525;}
.inp-sm{background:#070707;border:1px solid #1e1e1e;color:${C.text};padding:10px 10px;font-size:13px;font-family:'DM Mono',monospace;outline:none;transition:border-color .2s;width:100%;-webkit-appearance:none;border-radius:0;}
.inp-sm:focus{border-color:#383838;}
.inp-sm::placeholder{color:#282828;}
select.inp,select.inp-sm{-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23444'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;}
select.inp option,select.inp-sm option{background:#0e0e0e;}
.btn-p{background:${C.gold};color:#080808;border:none;padding:14px 28px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:500;cursor:pointer;transition:background .2s;border-radius:0;-webkit-appearance:none;min-height:44px;}
.btn-p:active{background:${C.goldL};}
@media(hover:hover){.btn-p:hover{background:${C.goldL};}}
.btn-g{background:transparent;color:${C.gold};border:1px solid #2a2a2a;padding:13px 20px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:border-color .2s,color .2s;border-radius:0;-webkit-appearance:none;min-height:44px;}
.btn-g:active{border-color:#444;color:${C.goldL};}
@media(hover:hover){.btn-g:hover{border-color:#444;color:${C.goldL};}}
.btn-d{background:#130909;color:#f87171;border:1px solid #2a1010;padding:10px 16px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;transition:background .15s;letter-spacing:1px;min-height:40px;}
.btn-sm{background:transparent;border:1px solid #232323;color:#555;padding:8px 14px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;transition:all .2s;min-height:36px;}
.btn-sm:active{border-color:#444;color:#888;}
@media(hover:hover){.btn-sm:hover{border-color:#444;color:#888;}}
.stage-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative;}
.stage-step:not(:last-child)::after{content:'';position:absolute;top:14px;left:calc(50% + 15px);width:calc(100% - 30px);height:1px;background:#1c1c1c;}
.stage-dot{width:28px;height:28px;border-radius:50%;border:2px solid #1e1e1e;display:flex;align-items:center;justify-content:center;font-size:10px;transition:all .3s;}
.menu-item{display:flex;align-items:center;gap:14px;padding:16px 24px;cursor:pointer;transition:background .15s;border-left:3px solid transparent;min-height:52px;}
.menu-item:active{background:#0f0f0f;}
@media(hover:hover){.menu-item:hover{background:#0f0f0f;border-left-color:#333;}}
.menu-item.active{background:#131313;border-left-color:${C.gold};}
.period-btn{background:transparent;border:1px solid #252525;color:#555;padding:10px 18px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s;min-height:40px;}
.period-btn.active{background:${C.gold}18;border-color:${C.gold}55;color:${C.gold};}
.variant-row{display:grid;grid-template-columns:1fr 1.4fr 0.7fr 60px 32px;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid #141414;}
.variant-row:last-child{border-bottom:none;}
.modal-overlay{position:fixed;inset:0;background:#000000cc;z-index:500;display:flex;align-items:flex-end;justify-content:center;}
@media(min-width:600px){.modal-overlay{align-items:center;}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fadeUp .3s ease forwards;}
@keyframes modalSlide{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes modalFade{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.modal-box{animation:modalSlide .25s ease forwards;width:100%;max-height:90vh;overflow-y:auto;}
@media(min-width:600px){.modal-box{animation:modalFade .2s ease forwards;width:auto;max-height:none;}}
.gantt-bar{height:22px;border-radius:2px;position:absolute;top:50%;transform:translateY(-50%);transition:opacity .15s;cursor:pointer;}
.gantt-today{position:absolute;top:0;bottom:0;width:1px;background:${C.gold};opacity:.5;pointer-events:none;}
/* Responsive grid helpers */
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
@media(max-width:768px){
  .grid-4{grid-template-columns:1fr 1fr;gap:10px;}
  .grid-2{grid-template-columns:1fr;gap:14px;}
  .grid-3{grid-template-columns:1fr 1fr;gap:10px;}
  .hide-mobile{display:none!important;}
  .variant-row{grid-template-columns:1fr 1fr 60px 50px 28px;gap:4px;}
}
@media(max-width:480px){
  .grid-4{grid-template-columns:1fr 1fr;}
  .grid-3{grid-template-columns:1fr;}
}
/* Bottom nav for mobile */
.bottom-nav{display:none;}
@media(max-width:768px){
  .bottom-nav{
    display:flex;position:fixed;bottom:0;left:0;right:0;
    background:#080808;border-top:1px solid ${C.border};
    z-index:90;padding-bottom:env(safe-area-inset-bottom,0px);
  }
  .bottom-nav-item{
    flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;
    padding:10px 4px;cursor:pointer;transition:background .15s;
    font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1.5px;
    text-transform:uppercase;color:#444;border:none;background:transparent;
    min-height:52px;
  }
  .bottom-nav-item.active{color:${C.gold};}
  .bottom-nav-icon{font-size:18px;line-height:1;}
  .page-content{padding-bottom:80px!important;}
}
/* Sync indicator */
.sync-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:6px;}
.sync-dot.ok{background:${C.green};}
.sync-dot.loading{background:${C.amber};animation:pulse .8s ease infinite;}
.sync-dot.error{background:${C.red};}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
`;

const LBL={display:"block",fontSize:10,letterSpacing:2.5,color:C.muted,textTransform:"uppercase",marginBottom:9,fontFamily:"'DM Mono',monospace"};
const SECT={fontFamily:"'Playfair Display',serif",fontSize:18,color:C.gold,margin:"32px 0 16px",paddingBottom:12,borderBottom:`1px solid ${C.border}`};

// ─── HOOK: window size ────────────────────────────────────────────────────────
function useIsMobile(){ const [m,setM]=useState(window.innerWidth<=768); useEffect(()=>{ const h=()=>setM(window.innerWidth<=768); window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h); }); return m; }

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function StagePill({stageId}){
  const st=stageOf(stageId);
  return <span style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 13px",background:st.color+"1a",color:st.color,border:`1px solid ${st.color}33`,fontSize:10,letterSpacing:2,textTransform:"uppercase",fontFamily:"'DM Mono',monospace",fontWeight:500,flexShrink:0}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:st.color,flexShrink:0}}/>{st.label}
  </span>;
}
function DeadlineBadge({deadline,style={}}){
  const d=daysLeft(deadline); if(d===null) return null;
  const color=d<0?C.red:d<=5?C.amber:C.muted;
  return <span style={{fontSize:10,color,letterSpacing:1.5,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",flexShrink:0,...style}}>⏱ {d<0?`Vencido ${Math.abs(d)}d`:d===0?"Hoy":`${d}d`}</span>;
}
function Stat({value,label,accent}){
  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"20px 18px",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:accent||C.gold}}/>
    <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:accent||C.gold,lineHeight:1,marginBottom:8}}>{value}</div>
    <div style={{fontSize:10,color:C.textSub,letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
  </div>;
}
function Timeline({currentStage}){
  const isMobile=useIsMobile();
  const idx=STAGES.findIndex(s=>s.id===currentStage);
  if(isMobile){
    // On mobile show compact horizontal scroll
    return <div style={{overflowX:"auto",marginBottom:28,paddingBottom:4}}>
      <div style={{display:"flex",alignItems:"flex-start",minWidth:480}}>
        {STAGES.map((st,i)=>{
          const done=i<idx,active=i===idx;
          return <div key={st.id} className="stage-step">
            <div className="stage-dot" style={{borderColor:done||active?st.color:"#1e1e1e",background:done?st.color:active?st.color+"22":"transparent",color:done?"#080808":active?st.color:C.muted,width:24,height:24}}>{done?"✓":""}</div>
            <div style={{fontSize:7,color:active?st.color:done?"#505050":"#242424",letterSpacing:1,marginTop:6,textAlign:"center",textTransform:"uppercase",maxWidth:50,lineHeight:1.4}}>{st.short}</div>
          </div>;
        })}
      </div>
    </div>;
  }
  return <div style={{display:"flex",alignItems:"flex-start",marginBottom:36}}>
    {STAGES.map((st,i)=>{
      const done=i<idx,active=i===idx;
      return <div key={st.id} className="stage-step">
        <div className="stage-dot" style={{borderColor:done||active?st.color:"#1e1e1e",background:done?st.color:active?st.color+"22":"transparent",color:done?"#080808":active?st.color:C.muted}}>{done?"✓":""}</div>
        <div style={{fontSize:8,color:active?st.color:done?"#505050":"#242424",letterSpacing:1,marginTop:8,textAlign:"center",textTransform:"uppercase",maxWidth:58,lineHeight:1.4}}>{st.short}</div>
      </div>;
    })}
  </div>;
}
function Checklist({stageId,tasks,onChange}){
  const list=STAGE_TASKS[stageId]||[];
  const done=list.filter(t=>tasks[t.id]).length;
  const pct=list.length>0?(done/list.length)*100:0;
  const st=stageOf(stageId);
  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"20px 20px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
      <div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:C.text,marginBottom:4}}>Checklist · {st.label}</div>
        <div style={{fontSize:11,color:C.textSub,letterSpacing:2}}>{done}/{list.length} completadas</div>
      </div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:pct===100?C.green:C.gold}}>{Math.round(pct)}%</div>
    </div>
    <div className="pbg" style={{marginBottom:18}}><div className="pfill" style={{width:pct+"%",background:pct===100?C.green:st.color}}/></div>
    {list.map(t=>{
      const checked=!!tasks[t.id];
      return <div key={t.id} className="task-row" onClick={()=>onChange(t.id,!checked)}>
        <div className={`chk ${checked?"done":""}`}>{checked&&<span style={{fontSize:11,color:"#080808",fontWeight:"bold"}}>✓</span>}</div>
        <span style={{fontSize:13,color:checked?C.muted:C.text,textDecoration:checked?"line-through":"none",lineHeight:1.6,fontFamily:"'DM Mono',monospace"}}>{t.text}</span>
      </div>;
    })}
  </div>;
}
function ChartTooltip({active,payload,label}){
  if(!active||!payload?.length) return null;
  return <div style={{background:"#111",border:`1px solid ${C.border2}`,padding:"12px 16px",fontFamily:"'DM Mono',monospace"}}>
    <div style={{fontSize:10,color:C.muted,letterSpacing:2,marginBottom:8}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{fontSize:12,color:p.color,marginBottom:3}}>{p.name}: <span style={{color:C.text}}>{p.name==="Inversión"?"$":""}{Number(p.value).toLocaleString("es-AR")}</span></div>)}
  </div>;
}

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────
function DeleteModal({name,onConfirm,onCancel}){
  return <div className="modal-overlay" onClick={onCancel}>
    <div className="modal-box" onClick={e=>e.stopPropagation()} style={{background:"#0e0e0e",border:`1px solid #2a1010`,padding:"32px 28px",maxWidth:440,width:"100%",borderRadius:"0"}}>
      <div style={{fontSize:24,color:C.red,marginBottom:8,fontFamily:"'Playfair Display',serif"}}>¿Eliminar?</div>
      <div style={{fontSize:13,color:C.textSub,marginBottom:8,lineHeight:1.6}}>Estás por eliminar permanentemente</div>
      <div style={{fontSize:15,color:C.text,fontFamily:"'Playfair Display',serif",marginBottom:24,padding:"12px 16px",background:"#111",border:`1px solid ${C.border}`}}>"{name}"</div>
      <div style={{display:"flex",gap:12}}>
        <button className="btn-d" style={{flex:1,padding:"14px",fontSize:11,letterSpacing:2}} onClick={onConfirm}>Eliminar</button>
        <button className="btn-g" style={{flex:1}} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  </div>;
}

// ─── VARIANT TABLE ────────────────────────────────────────────────────────────
function VariantTable({model,modelIdx,onUpdateVariant,onAddVariant,onRemoveVariant}){
  const total=(model.variants||[]).reduce((a,v)=>a+(+v.qty||0),0);
  const isMobile=useIsMobile();
  return <div>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr 60px 50px 28px":"1fr 1.4fr 0.7fr 60px 32px",gap:isMobile?4:6,padding:"0 0 8px",borderBottom:`1px solid ${C.border}`}}>
      {["Color","Estampa","Talle","Cant.",""].map((h,i)=><div key={i} style={{fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{h}</div>)}
    </div>
    {(model.variants||[]).map((v,vi)=>(
      <div key={v.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr 60px 50px 28px":"1fr 1.4fr 0.7fr 60px 32px",gap:isMobile?4:6,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #141414"}}>
        <input className="inp-sm" value={v.color} onChange={e=>onUpdateVariant(modelIdx,vi,"color",e.target.value)} placeholder="Negro…"/>
        <input className="inp-sm" value={v.stamp} onChange={e=>onUpdateVariant(modelIdx,vi,"stamp",e.target.value)} placeholder="Logo pecho…"/>
        <input className="inp-sm" value={v.size}  onChange={e=>onUpdateVariant(modelIdx,vi,"size",e.target.value)} placeholder="M…"/>
        <input className="inp-sm" type="number" min={0} value={v.qty||""} onChange={e=>onUpdateVariant(modelIdx,vi,"qty",e.target.value)} placeholder="0" style={{textAlign:"center"}}/>
        <button onClick={()=>onRemoveVariant(modelIdx,vi)} style={{background:"transparent",border:"none",color:"#5a2020",cursor:"pointer",fontSize:16,padding:"4px",minHeight:28,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
    ))}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:12,flexWrap:"wrap",gap:8}}>
      <button className="btn-sm" onClick={()=>onAddVariant(modelIdx)}>+ Agregar fila</button>
      <span style={{fontSize:11,color:C.muted}}>Subtotal: <span style={{color:C.gold,fontFamily:"'Playfair Display',serif",fontSize:15}}>{total}</span> u.</span>
    </div>
  </div>;
}

// ─── VARIANT DETAIL (read-only) ────────────────────────────────────────────────
function VariantDetailTable({models}){
  const allV=(models||[]).flatMap(m=>(m.variants||[]).map(v=>({...v,modelName:m.name})));
  const byColor={};
  allV.forEach(v=>{ if(!byColor[v.color])byColor[v.color]={}; if(!byColor[v.color][v.stamp])byColor[v.color][v.stamp]=[]; byColor[v.color][v.stamp].push(v); });
  return <div>
    {Object.entries(byColor).map(([color,stamps])=>(
      <div key={color} style={{marginBottom:14,background:C.panelB,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div style={{padding:"10px 16px",background:"#0a0a0a",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.gold,flexShrink:0}}/>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:C.text}}>{color||"—"}</span>
          <span style={{fontSize:10,color:C.muted,marginLeft:"auto"}}>{Object.values(stamps).flat().reduce((a,v)=>a+(+v.qty||0),0)} u.</span>
        </div>
        {Object.entries(stamps).map(([stamp,variants])=>(
          <div key={stamp} style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.textSub,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>{stamp||"Sin estampa"}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {variants.map(v=>(
                <div key={v.id} style={{background:"#0f0f0f",border:`1px solid ${C.border2}`,padding:"6px 12px",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:C.textSub}}>{v.size||"—"}</span>
                  <span style={{width:1,height:12,background:C.border2}}/>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:C.gold}}>{v.qty}</span>
                  <span style={{fontSize:10,color:C.muted}}>u.</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ))}
  </div>;
}

// ─── PRODUCTION FORM ─────────────────────────────────────────────────────────
function ProductionForm({title,subtitle,data,setData,onSave,onCancel,saveLabel="Guardar"}){
  const uc=unitCostOf(data.costs);
  const totalU=totalUnitsOf(data.models);
  function addModel_(){ setData(p=>({...p,models:[...p.models,newModel(`Modelo ${p.models.length+1}`)]})); }
  function removeModel_(mi){ setData(p=>({...p,models:p.models.filter((_,i)=>i!==mi)})); }
  function updateModelName_(mi,name){ setData(p=>{const ms=[...p.models];ms[mi]={...ms[mi],name};return{...p,models:ms};}); }
  function addVariant_(mi){ setData(p=>{const ms=[...p.models];ms[mi]={...ms[mi],variants:[...ms[mi].variants,newVariant()]};return{...p,models:ms};}); }
  function removeVariant_(mi,vi){ setData(p=>{const ms=[...p.models];ms[mi]={...ms[mi],variants:ms[mi].variants.filter((_,i)=>i!==vi)};return{...p,models:ms};}); }
  function updateVariant_(mi,vi,field,val){ setData(p=>{const ms=[...p.models];const vs=[...ms[mi].variants];vs[vi]={...vs[vi],[field]:field==="qty"?+val:val};ms[mi]={...ms[mi],variants:vs};return{...p,models:ms};}); }

  return <div style={{maxWidth:920,margin:"0 auto",padding:"28px 16px"}} className="fu page-content">
    <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:C.text,marginBottom:4}}>{title}</h1>
    <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:28}}>{subtitle}</p>
    <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"24px 20px"}}>
      <div style={SECT}>Datos generales</div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><label style={LBL}>Nombre del producto *</label><input className="inp" value={data.name} onChange={e=>setData(p=>({...p,name:e.target.value}))} placeholder="Ej: Remera Verano 2025"/></div>
        <div><label style={LBL}>Estado</label><select className="inp" value={data.stage} onChange={e=>setData(p=>({...p,stage:e.target.value}))}>{STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div className="grid-3">
          <div><label style={LBL}>Fecha de creación</label><input className="inp" type="date" value={data.createdAt} onChange={e=>setData(p=>({...p,createdAt:e.target.value}))}/></div>
          <div><label style={LBL}>Fecha límite</label><input className="inp" type="date" value={data.deadline} onChange={e=>setData(p=>({...p,deadline:e.target.value}))}/></div>
          <div><label style={LBL}>Tipo de tela</label><select className="inp" value={data.fabric} onChange={e=>setData(p=>({...p,fabric:e.target.value}))}>{FABRICS.map(f=><option key={f}>{f}</option>)}</select></div>
        </div>
        <div style={{maxWidth:240}}><label style={LBL}>Peso por prenda (g)</label><input className="inp" type="number" value={data.weightPerUnit||""} onChange={e=>setData(p=>({...p,weightPerUnit:+e.target.value}))} placeholder="180"/></div>
      </div>

      <div style={SECT}>Costeo unitario</div>
      <div className="grid-4" style={{gap:12}}>
        {[["tela","Tela"],["estampa","Estampa"],["corte","Corte & Conf."],["avios","Avíos"]].map(([k,l])=>(
          <div key={k}><label style={LBL}>{l} ($)</label><input className="inp" type="number" value={data.costs[k]||""} onChange={e=>setData(p=>({...p,costs:{...p.costs,[k]:+e.target.value}}))}/></div>
        ))}
      </div>
      {uc>0&&<div style={{marginTop:16,background:"#060606",border:`1px solid ${C.gold}20`,padding:"14px 18px",display:"flex",flexWrap:"wrap",gap:24,alignItems:"center"}}>
        <div><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Costo unitario</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.gold}}>${uc.toLocaleString("es-AR")}</div></div>
        {totalU>0&&<div><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Total ({totalU} u.)</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.text}}>${(uc*totalU).toLocaleString("es-AR")}</div></div>}
      </div>}

      <div style={SECT}>Modelos · Color / Estampa / Talle</div>
      <p style={{fontSize:12,color:C.muted,marginBottom:18,lineHeight:1.7}}>Cada modelo es una variante del producto. Agregá filas con la combinación exacta de color, estampa, talle y cantidad.</p>
      {data.models.map((m,mi)=>{
        const mT=(m.variants||[]).reduce((a,v)=>a+(+v.qty||0),0);
        return <div key={m.id} style={{background:"#0a0a0a",border:`1px solid ${C.border}`,padding:"18px 16px",marginBottom:14}}>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160}}><label style={LBL}>Nombre del modelo</label><input className="inp" value={m.name} onChange={e=>updateModelName_(mi,e.target.value)} placeholder="Ej: Regular Fit…"/></div>
            <div style={{display:"flex",alignItems:"center",gap:12,paddingTop:20}}>
              <span style={{fontSize:11,color:C.muted}}>Subtotal: <span style={{color:C.gold,fontFamily:"'Playfair Display',serif",fontSize:18}}>{mT}</span> u.</span>
              {data.models.length>1&&<button className="btn-d" style={{padding:"8px 12px",fontSize:10}} onClick={()=>removeModel_(mi)}>✕</button>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}><VariantTable model={m} modelIdx={mi} onUpdateVariant={updateVariant_} onAddVariant={addVariant_} onRemoveVariant={removeVariant_}/></div>
        </div>;
      })}
      <button className="btn-g" style={{marginBottom:28}} onClick={addModel_}>+ Agregar modelo</button>
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:24,display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
        <button className="btn-p" onClick={onSave}>{saveLabel}</button>
        <button className="btn-g" onClick={onCancel}>Cancelar</button>
        {totalU>0&&<span style={{marginLeft:"auto",fontSize:11,color:C.muted}}>Total: <span style={{color:C.gold,fontFamily:"'Playfair Display',serif",fontSize:15}}>{totalU} u.</span>{uc>0&&<span style={{color:C.textSub}}> · ${(uc*totalU).toLocaleString("es-AR")}</span>}</span>}
      </div>
    </div>
  </div>;
}

// ─── MONTHLY CALENDAR ─────────────────────────────────────────────────────────
const MONTH_NAMES_ES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAY_NAMES_ES=["Lu","Ma","Mi","Ju","Vi","Sá","Do"];
function MonthlyCalendar({prods,onClickProd,year,month,onPrev,onNext}){
  const today=new Date(); today.setHours(0,0,0,0);
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDow=new Date(year,month,1).getDay();
  const adjustedFirst=firstDow===0?6:firstDow-1;
  const monthStart=new Date(year,month,1);
  const monthEnd=new Date(year,month,daysInMonth,23,59,59);
  const activeProds=prods.filter(p=>{ if(!p.createdAt)return false; const s=new Date(p.createdAt+"T00:00:00");const e=p.deadline?new Date(p.deadline+"T00:00:00"):new Date(today.getTime()+60*86400000);return s<=monthEnd&&e>=monthStart; });
  function prodsForDay(d){ const dt=new Date(year,month,d);dt.setHours(0,0,0,0);return activeProds.filter(p=>{ const s=new Date(p.createdAt+"T00:00:00");const e=p.deadline?new Date(p.deadline+"T00:00:00"):new Date(today.getTime()+60*86400000);return s<=dt&&e>=dt; }); }
  function isToday(d){ return today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d; }
  function isStart(p,d){ const s=new Date(p.createdAt+"T00:00:00");return s.getFullYear()===year&&s.getMonth()===month&&s.getDate()===d; }
  function isEnd(p,d){ if(!p.deadline)return false;const e=new Date(p.deadline+"T00:00:00");return e.getFullYear()===year&&e.getMonth()===month&&e.getDate()===d; }
  const cells=[];
  for(let i=0;i<adjustedFirst;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
      <button className="btn-sm" onClick={onPrev}>←</button>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.text,textAlign:"center"}}>{MONTH_NAMES_ES[month]} <span style={{color:C.gold}}>{year}</span></div>
      <button className="btn-sm" onClick={onNext}>→</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:3}}>
      {DAY_NAMES_ES.map(d=><div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,letterSpacing:2,padding:"6px 0",borderBottom:`1px solid ${C.border}`,textTransform:"uppercase"}}>{d}</div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
      {cells.map((day,i)=>{
        if(!day) return <div key={`e${i}`} style={{minHeight:80}}/>;
        const dp=prodsForDay(day);
        const todF=isToday(day);
        return <div key={day} style={{minHeight:80,background:todF?"#141000":"#0b0b0b",border:`1px solid ${todF?C.gold+"55":C.border}`,padding:"6px 5px"}}>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6}}>
            <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:todF?C.gold:"#444",fontWeight:todF?"600":"normal"}}>{day}</span>
            {todF&&<span style={{fontSize:7,color:C.gold,letterSpacing:1,textTransform:"uppercase"}}>hoy</span>}
          </div>
          {dp.slice(0,3).map(p=>{
            const sc=stageOf(p.stage).color;
            const starting=isStart(p,day);const ending=isEnd(p,day);
            return <div key={p.id} onClick={()=>onClickProd(p.id)} title={p.name} style={{height:16,marginBottom:2,cursor:"pointer",background:sc+"28",borderTop:`2px solid ${sc}`,borderLeft:starting?`2px solid ${sc}`:"2px solid transparent",borderRight:ending?`2px solid ${sc}`:"2px solid transparent",borderRadius:starting&&ending?3:starting?"3px 0 0 3px":ending?"0 3px 3px 0":0,display:"flex",alignItems:"center",paddingLeft:starting?5:2,overflow:"hidden",}}>
              {starting&&<span style={{fontSize:7,color:sc,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",fontWeight:"600",letterSpacing:.3}}>{p.name.length>8?p.name.slice(0,7)+"…":p.name}</span>}
            </div>;
          })}
          {dp.length>3&&<div style={{fontSize:7,color:C.muted}}>+{dp.length-3}</div>}
        </div>;
      })}
    </div>
    {activeProds.length>0&&<div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
      <div style={{fontSize:9,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:10}}>Este mes</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
        {activeProds.map(p=>{const sc=stageOf(p.stage).color;return <div key={p.id} onClick={()=>onClickProd(p.id)} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",padding:"6px 12px",background:"#0c0c0c",border:`1px solid ${C.border}`}}>
          <div style={{width:8,height:8,borderRadius:1,background:sc,opacity:.85}}/>
          <span style={{fontSize:10,color:C.text,fontFamily:"'DM Mono',monospace"}}>{p.name}</span>
          <span style={{fontSize:8,color:sc,letterSpacing:1.5,textTransform:"uppercase"}}>{stageOf(p.stage).short}</span>
        </div>;})}
      </div>
    </div>}
    {activeProds.length===0&&<div style={{marginTop:16,fontSize:13,color:C.muted,textAlign:"center",padding:"20px 0"}}>Sin producciones activas este mes.</div>}
  </div>;
}

// ─── ANNUAL GANTT ─────────────────────────────────────────────────────────────
function AnnualGantt({prods,onClickProd,year,onPrev,onNext}){
  const today=new Date();today.setHours(0,0,0,0);
  const yearStart=new Date(year,0,1);const yearEnd=new Date(year,11,31,23,59,59);
  const isLeap=(year%4===0&&year%100!==0)||(year%400===0);const totalDays=isLeap?366:365;
  const MONTHS_SHORT=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const monthCols=MONTHS_SHORT.map((label,m)=>{ const days=new Date(year,m+1,0).getDate();const startDay=Math.round((new Date(year,m,1)-yearStart)/86400000);return{label,days,startDay,pct:(startDay/totalDays)*100,widthPct:(days/totalDays)*100}; });
  function datePct(ds){ if(!ds)return null;const d=new Date(ds+"T00:00:00");if(d<yearStart)return 0;if(d>yearEnd)return 100;return(Math.round((d-yearStart)/86400000)/totalDays)*100; }
  const todayPct=today.getFullYear()===year?datePct(today.toISOString().split("T")[0]):null;
  const visible=[...prods].filter(p=>{ if(!p.createdAt)return false;const s=new Date(p.createdAt+"T00:00:00");const e=p.deadline?new Date(p.deadline+"T00:00:00"):new Date(today.getTime()+60*86400000);return s<=yearEnd&&e>=yearStart; }).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const LW=160;
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
      <button className="btn-sm" onClick={onPrev}>← {year-1}</button>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.text,letterSpacing:3}}>{year}</div>
      <button className="btn-sm" onClick={onNext}>{year+1} →</button>
    </div>
    {/* Month header */}
    <div style={{display:"flex",marginLeft:LW,borderBottom:`1px solid ${C.border}`,marginBottom:0}}>
      {monthCols.map((m,i)=><div key={i} style={{flex:`0 0 ${m.widthPct}%`,borderLeft:`1px solid ${C.border}`,padding:"0 4px 8px 5px"}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{m.label}</div>
      </div>)}
    </div>
    {/* Rows */}
    {visible.length===0&&<div style={{padding:"40px 0",textAlign:"center",color:C.muted,fontSize:13}}>No hay producciones en {year}.</div>}
    {visible.map((prod,ri)=>{
      const sc=stageOf(prod.stage).color;const isActive=prod.stage!=="terminado";
      const sp=Math.max(0,datePct(prod.createdAt)||0);
      const rawEp=prod.deadline?datePct(prod.deadline):Math.min(100,datePct(new Date(today.getTime()+60*86400000).toISOString().split("T")[0]));
      const ep=Math.min(100,rawEp??100);const wp=Math.max(ep-sp,0.5);
      return <div key={prod.id} style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,minHeight:52,background:ri%2===0?"#0b0b0b":"#0d0d0d"}}>
        <div style={{width:LW,flexShrink:0,padding:"10px 14px 10px 0",cursor:"pointer"}} onClick={()=>onClickProd(prod.id)}>
          <div style={{fontSize:12,color:C.text,fontFamily:"'Playfair Display',serif",lineHeight:1.3,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:LW-16}}>{prod.name}</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:sc}}/>
            <span style={{fontSize:8,color:sc,letterSpacing:1.5,textTransform:"uppercase"}}>{stageOf(prod.stage).short}</span>
          </div>
        </div>
        <div style={{flex:1,position:"relative",height:52}}>
          {monthCols.map((m,i)=><div key={i} style={{position:"absolute",left:`${m.pct}%`,top:0,bottom:0,width:1,background:i%2===0?"#141414":"#111",pointerEvents:"none"}}/>)}
          {todayPct!==null&&<div style={{position:"absolute",left:`${todayPct}%`,top:0,bottom:0,width:1,background:C.gold,opacity:.4,zIndex:3,pointerEvents:"none"}}/>}
          <div onClick={()=>onClickProd(prod.id)} style={{position:"absolute",left:`${sp}%`,width:`${wp}%`,height:22,top:"50%",transform:"translateY(-50%)",background:isActive?sc+"2a":sc+"14",border:`1px solid ${isActive?sc+"bb":sc+"44"}`,borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",paddingLeft:8,overflow:"hidden",zIndex:2}}>
            <span style={{fontSize:9,color:sc,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",letterSpacing:.5,fontWeight:"500"}}>{prod.name.length>18?prod.name.slice(0,17)+"…":prod.name}</span>
          </div>
        </div>
      </div>;
    })}
    <div style={{display:"flex",alignItems:"center",gap:14,marginTop:16,paddingTop:12,borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
      {todayPct!==null&&<div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:16,height:1,background:C.gold,opacity:.5}}/><span style={{fontSize:10,color:C.muted}}>Hoy</span></div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginLeft:"auto"}}>
        {STAGES.map(st=><div key={st.id} style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:12,height:7,borderRadius:1,background:st.color,opacity:.7}}/><span style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{st.short}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

// ─── HAMBURGER MENU ───────────────────────────────────────────────────────────
const NAV_ITEMS=[
  {id:"dashboard",label:"Dashboard",  icon:"◈"},
  {id:"history",  label:"Historial",  icon:"◎"},
  {id:"calendar", label:"Calendario", icon:"▦"},
  {id:"charts",   label:"Gráficos",   icon:"◉"},
  {id:"simulator",label:"Simulador",  icon:"◇"},
];
const BOTTOM_NAV=[
  {id:"dashboard",label:"Inicio",    icon:"◈"},
  {id:"history",  label:"Historial", icon:"◎"},
  {id:"calendar", label:"Calendario",icon:"▦"},
  {id:"charts",   label:"Gráficos",  icon:"◉"},
  {id:"simulator",label:"Costos",    icon:"◇"},
];
function HamburgerMenu({view,setView,onNew}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h); },[]);
  function go(v){setView(v);setOpen(false);}
  return <>
    {open&&<div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,background:"#000000b0",zIndex:150}}/>}
    <div ref={ref} style={{position:"fixed",top:0,left:open?0:-300,width:280,height:"100vh",background:"#090909",borderRight:`1px solid ${C.border}`,zIndex:200,transition:"left .26s cubic-bezier(.4,0,.2,1)",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"28px 22px 18px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,letterSpacing:5,color:C.gold,textTransform:"uppercase",marginBottom:3}}>Studio Pro</div>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2}}>GESTIÓN DE PRODUCCIÓN</div>
      </div>
      <div style={{flex:1,paddingTop:8,overflowY:"auto"}}>
        {NAV_ITEMS.map(item=><div key={item.id} className={`menu-item ${view===item.id?"active":""}`} onClick={()=>go(item.id)}>
          <span style={{fontSize:16,color:view===item.id?C.gold:C.muted}}>{item.icon}</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:2,color:view===item.id?C.text:"#606060",textTransform:"uppercase"}}>{item.label}</span>
        </div>)}
      </div>
      <div style={{padding:"18px 22px",borderTop:`1px solid ${C.border}`}}>
        <button className="btn-p" style={{width:"100%"}} onClick={()=>{onNew();setOpen(false);}}>+ Nueva producción</button>
      </div>
    </div>
    <button onClick={()=>setOpen(o=>!o)} style={{background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",gap:5,padding:8,minWidth:40,minHeight:40,alignItems:"center",justifyContent:"center"}}>
      <span style={{width:22,height:2,background:open?C.gold:C.text,transition:"all .22s",transform:open?"rotate(45deg) translate(5px,5px)":"none",display:"block"}}/>
      <span style={{width:22,height:2,background:open?C.gold:C.text,transition:"all .22s",opacity:open?0:1,display:"block"}}/>
      <span style={{width:22,height:2,background:open?C.gold:C.text,transition:"all .22s",transform:open?"rotate(-45deg) translate(5px,-5px)":"none",display:"block"}}/>
    </button>
  </>;
}

// ─── CHART HELPERS ─────────────────────────────────────────────────────────────
function buildChartData(prods,period){
  const sorted=[...prods].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  if(!sorted.length)return[];
  const getKey=ds=>{const d=new Date(ds+"T12:00:00"),y=d.getFullYear(),m=d.getMonth();if(period==="mes")return`${String(m+1).padStart(2,"0")}/${y}`;if(period==="cuatri")return`C${Math.floor(m/4)+1} ${y}`;if(period==="semestre")return`S${Math.floor(m/6)+1} ${y}`;return`${y}`;};
  const map={};
  sorted.forEach(p=>{const k=getKey(p.createdAt);if(!map[k])map[k]={period:k,unidades:0,inversion:0};const u=totalUnitsOf(p.models);map[k].unidades+=u;map[k].inversion+=unitCostOf(p.costs)*u;});
  return Object.values(map);
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App(){
  const [prods, setProds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState("ok"); // "ok" | "saving" | "error"

  // Cargar producciones al iniciar
  useEffect(() => {
    api.getAll()
      .then(data => { setProds(data); setLoading(false); })
      .catch(err => { console.error(err); setSyncState("error"); setLoading(false); });
  }, []);

  async function persist(prod) {
    setSyncState("saving");
    // Actualizar UI inmediatamente (optimistic update)
    setProds(prev => {
      const exists = prev.find(p => p.id === prod.id);
      return exists ? prev.map(p => p.id === prod.id ? prod : p) : [...prev, prod];
    });
    try {
      await api.save(prod);
      setSyncState("ok");
    } catch(err) {
      console.error(err);
      setSyncState("error");
    }
  }

  async function remove(id) {
    setSyncState("saving");
    setProds(prev => prev.filter(p => p.id !== id)); // optimistic
    try {
      await api.delete(id);
      setSyncState("ok");
    } catch(err) {
      console.error(err);
      setSyncState("error");
    }
  }

  const [view,setView]=useState("dashboard");
  const [selId,setSelId]=useState(null);
  const [prevView,setPrevView]=useState("dashboard");
  const [np,setNp]=useState(null);
  const [editData,setEditData]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [chartPeriod,setChartPeriod]=useState("mes");
  const [sim,setSim]=useState({qty:50,tela:850,estampa:300,corte:250,avios:120,fabric:"Jersey 30/1",weight:180});
  const todayRef=new Date();
  const [calMode,setCalMode]=useState("mensual");
  const [calYear,setCalYear]=useState(todayRef.getFullYear());
  const [calMonth,setCalMonth]=useState(todayRef.getMonth());

  const sel=prods.find(p=>p.id===selId);
  const isMobile=useIsMobile();

  function goDetail(id,from){setPrevView(from||view);setSelId(id);setView("detail");}
  function goBack(){setView(prevView||"dashboard");}
  function toggleTask(pid,tid,val){
    const updated = prods.map(p => p.id!==pid ? p : {...p, tasks:{...p.tasks,[tid]:val}});
    setProds(updated);
    const prod = updated.find(p => p.id === pid);
    if (prod) persist(prod);
  }
  function changeStage(pid,stage){
    const updated = prods.map(p => p.id!==pid ? p : {...p, stage});
    setProds(updated);
    const prod = updated.find(p => p.id === pid);
    if (prod) persist(prod);
  }

  function startNew(){
    setNp({id:gid(),name:"",fabric:FABRICS[0],weightPerUnit:0,stage:"comprar_tela",deadline:"",createdAt:new Date().toISOString().split("T")[0],models:[newModel("Modelo 1")],costs:{tela:0,estampa:0,corte:0,avios:0},tasks:{}});
    setView("new");
  }
  async function saveNew(){
    if(!np.name.trim())return;
    await persist(np);
    setView("dashboard");
  }

  function startEdit(prod){setEditData(deepClone(prod));setView("edit");}
  async function saveEdit(){
    if(!editData.name.trim())return;
    await persist(editData);
    setSelId(editData.id);
    setView("detail");
  }

  function confirmDelete(id){setDeleteTarget(id);}
  async function doDelete(){
    const id=deleteTarget;
    setDeleteTarget(null);
    await remove(id);
    if(selId===id){setSelId(null);setView(prevView||"dashboard");}
  }

  // ── LAYOUT ──────────────────────────────────────────────────────────────
  function Layout({children,right,noPad}){
    return <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Mono',monospace",color:C.text}}>
      <style>{GCS}</style>
      {deleteTarget&&<DeleteModal name={prods.find(p=>p.id===deleteTarget)?.name||""} onConfirm={doDelete} onCancel={()=>setDeleteTarget(null)}/>}
      <header style={{borderBottom:`1px solid ${C.border}`,padding:"0 16px 0 12px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:C.bg+"f0",backdropFilter:"blur(10px)",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <HamburgerMenu view={view} setView={setView} onNew={startNew}/>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?16:20,letterSpacing:isMobile?3:6,color:C.gold,textTransform:"uppercase"}}>Studio Pro</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Sync indicator */}
          <span style={{fontSize:9,display:"flex",alignItems:"center",gap:5,letterSpacing:1,color:syncState==="error"?C.red:syncState==="saving"?C.amber:C.green}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:syncState==="error"?C.red:syncState==="saving"?C.amber:C.green,display:"inline-block",animation:syncState==="saving"?"pulse .8s ease infinite":"none"}}/>
            {syncState==="saving"?"Guardando":syncState==="error"?"Sin conexión":"Guardado"}
          </span>
          {right&&<div className="hide-mobile">{right}</div>}
        </div>
      </header>
      {children}
      {/* Bottom navigation — mobile only */}
      <nav className="bottom-nav">
        {BOTTOM_NAV.map(item=><button key={item.id} className={`bottom-nav-item ${view===item.id?"active":""}`} onClick={()=>setView(item.id)}>
          <span className="bottom-nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>)}
      </nav>
    </div>;
  }



  // ── LOADING ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
        <style>{GCS}</style>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:36,color:C.gold,letterSpacing:8,textTransform:"uppercase"}}>Studio Pro</div>
        <div style={{display:"flex",gap:6}}>
          {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.gold,opacity:.7,animation:`pulse .8s ease ${i*0.2}s infinite`}}/>)}
        </div>
        {syncState==="error"&&<div style={{fontSize:11,color:C.red,letterSpacing:2,marginTop:8}}>No se pudo conectar al servidor</div>}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: DETAIL
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="detail"&&sel){
    const uc=unitCostOf(sel.costs);
    const totalU=totalUnitsOf(sel.models);
    const tot=uc*totalU;
    const kg=(sel.weightPerUnit*totalU)/1000;
    return <Layout right={
      <div style={{display:"flex",gap:8}}>
        <button className="btn-g" style={{padding:"8px 16px",fontSize:9}} onClick={()=>startEdit(sel)}>✏ Editar</button>
        <button className="btn-d" style={{padding:"8px 12px",fontSize:9}} onClick={()=>confirmDelete(sel.id)}>✕</button>
        <button className="btn-g" style={{padding:"8px 16px",fontSize:9}} onClick={goBack}>← Volver</button>
      </div>
    }>
      <div style={{maxWidth:1140,margin:"0 auto",padding:isMobile?"16px 14px":"40px 32px"}} className="fu page-content">
        {/* Mobile action bar */}
        {isMobile&&<div style={{display:"flex",gap:8,marginBottom:18}}>
          <button className="btn-g" style={{flex:1,padding:"10px",fontSize:9}} onClick={()=>startEdit(sel)}>✏ Editar</button>
          <button className="btn-d" style={{padding:"10px 16px",fontSize:9}} onClick={()=>confirmDelete(sel.id)}>✕ Eliminar</button>
          <button className="btn-g" style={{padding:"10px",fontSize:9}} onClick={goBack}>← Volver</button>
        </div>}
        {/* Header */}
        <StagePill stageId={sel.stage}/>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?26:38,color:C.text,margin:"10px 0 8px",lineHeight:1.15}}>{sel.name}</h1>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center",marginBottom:24}}>
          <span style={{fontSize:12,color:C.textSub}}>{sel.fabric} · {sel.weightPerUnit}g/prenda · {totalU} unidades</span>
          <span style={{fontSize:12,color:C.muted}}>Creada: {fmtDate(sel.createdAt)}</span>
          {sel.deadline&&<DeadlineBadge deadline={sel.deadline}/>}
          {sel.deadline&&<span style={{fontSize:12,color:C.muted}}>Límite: {fmtDate(sel.deadline)}</span>}
        </div>
        {/* Stage change */}
        <div style={{marginBottom:28}}>
          <label style={LBL}>Cambiar estado</label>
          <select className="inp" style={{maxWidth:280}} value={sel.stage} onChange={e=>changeStage(sel.id,e.target.value)}>
            {STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <Timeline currentStage={sel.stage}/>
        {/* Stats */}
        <div className="grid-4" style={{marginBottom:24}}>
          <Stat value={totalU} label="Unidades"/>
          <Stat value={"$"+uc.toLocaleString("es-AR")} label="Costo unit."/>
          <Stat value={"$"+tot.toLocaleString("es-AR")} label="Inversión" accent={C.textSub}/>
          <Stat value={kg.toFixed(1)+"kg"} label="Tela est." accent="#60a5fa"/>
        </div>
        {/* Checklist + Costs */}
        <div className="grid-2" style={{marginBottom:24}}>
          <Checklist stageId={sel.stage} tasks={sel.tasks} onChange={(tid,val)=>toggleTask(sel.id,tid,val)}/>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"20px 18px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:C.text,marginBottom:18}}>Desglose de costos</div>
            {[["tela","Tela"],["estampa","Estampa"],["corte","Corte & Conf."],["avios","Avíos"]].map(([k,l])=>{
              const pct=uc>0?(Number(sel.costs[k])/uc)*100:0;
              return <div key={k} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span style={{color:C.textSub}}>{l}</span><span style={{color:C.gold}}>${Number(sel.costs[k]).toLocaleString("es-AR")} <span style={{color:C.muted}}>({pct.toFixed(0)}%)</span></span></div>
                <div className="pbg"><div className="pfill" style={{width:pct+"%",background:C.gold}}/></div>
              </div>;
            })}
          </div>
        </div>
        {/* Models */}
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"20px 18px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.text,marginBottom:4}}>Clasificación de modelos</div>
          <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>{sel.models.length} modelo{sel.models.length!==1?"s":""}</div>
          {(sel.models||[]).map(m=>{
            const mT=(m.variants||[]).reduce((a,v)=>a+(+v.qty||0),0);
            return <div key={m.id} style={{marginBottom:24}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:3,height:22,background:C.gold}}/>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.text}}>{m.name}</span>
                <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{mT} u.</span>
              </div>
              <VariantDetailTable models={[m]}/>
            </div>;
          })}
        </div>
      </div>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: NEW / EDIT
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="new"&&np){
    return <Layout right={<button className="btn-g" style={{padding:"8px 16px",fontSize:9}} onClick={()=>setView("dashboard")}>← Cancelar</button>}>
      <ProductionForm title="Nueva Producción" subtitle="Completá los datos de la orden" data={np} setData={setNp} onSave={saveNew} onCancel={()=>setView("dashboard")} saveLabel="Guardar producción"/>
    </Layout>;
  }
  if(view==="edit"&&editData){
    return <Layout right={
      <div style={{display:"flex",gap:8}}>
        <button className="btn-d" style={{padding:"8px 12px",fontSize:9}} onClick={()=>confirmDelete(editData.id)}>✕ Eliminar</button>
        <button className="btn-g" style={{padding:"8px 16px",fontSize:9}} onClick={()=>{setSelId(editData.id);setView("detail");}}>← Cancelar</button>
      </div>
    }>
      <ProductionForm title="Editar Producción" subtitle="Modificá los datos de la orden" data={editData} setData={setEditData} onSave={saveEdit} onCancel={()=>{setSelId(editData.id);setView("detail");}} saveLabel="Guardar cambios"/>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="history"){
    const sorted=[...prods].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return <Layout>
      <div style={{maxWidth:1120,margin:"0 auto",padding:isMobile?"16px 14px":"40px 32px"}} className="fu page-content">
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?28:38,color:C.text,marginBottom:4}}>Historial</h1>
        <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:24}}>{prods.length} registros</p>
        {sorted.map((prod,idx)=>{
          const uc=unitCostOf(prod.costs);const totalU=totalUnitsOf(prod.models);const st=stageOf(prod.stage);
          return <div key={prod.id} style={{background:C.panel,border:`1px solid ${C.border}`,padding:"16px 16px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>goDetail(prod.id,"history")}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?16:18,color:C.text,marginBottom:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{prod.name}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,color:st.color,letterSpacing:1.5,textTransform:"uppercase"}}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:st.color}}/>{st.short}
                  </span>
                  <span style={{fontSize:11,color:C.muted}}>{prod.fabric}</span>
                  {!isMobile&&<><span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.gold}}>${uc.toLocaleString("es-AR")}</span><span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.text}}>{totalU} u.</span></>}
                  <span style={{fontSize:10,color:C.muted}}>Creada: {fmtDate(prod.createdAt)}</span>
                  {prod.deadline&&<DeadlineBadge deadline={prod.deadline} style={{fontSize:9}}/>}
                </div>
                {isMobile&&<div style={{display:"flex",gap:12,marginTop:6}}>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.gold}}>${uc.toLocaleString("es-AR")}</span>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.text}}>{totalU} u.</span>
                </div>}
              </div>
              <div style={{display:"flex",gap:7,flexShrink:0}}>
                <button className="btn-sm" style={{padding:"7px 10px"}} onClick={()=>goDetail(prod.id,"history")}>Ver</button>
                <button className="btn-sm" style={{color:C.gold,borderColor:"#2a2a2a",padding:"7px 10px"}} onClick={()=>{setPrevView("history");startEdit(prod);}}>✏</button>
                <button className="btn-sm" style={{color:C.red,borderColor:"#2a1010",padding:"7px 10px"}} onClick={()=>confirmDelete(prod.id)}>✕</button>
              </div>
            </div>
          </div>;
        })}
        {sorted.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:C.muted}}>Sin producciones.</div>}
      </div>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: CALENDAR
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="calendar"){
    function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}
    function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}
    return <Layout>
      <div style={{maxWidth:1300,margin:"0 auto",padding:isMobile?"16px 10px":"40px 32px"}} className="fu page-content">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?26:38,color:C.text,marginBottom:4}}>Calendario</h1>
            <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase"}}>Click en una producción para ver detalles</p>
          </div>
          <div style={{display:"flex",gap:0,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            {[{id:"mensual",label:"Mensual"},{id:"anual",label:"Anual"}].map(m=>(
              <button key={m.id} onClick={()=>setCalMode(m.id)} style={{padding:isMobile?"10px 16px":"10px 22px",fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",border:"none",background:calMode===m.id?C.gold:"#0c0c0c",color:calMode===m.id?"#080808":C.muted,minHeight:40}}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:isMobile?"16px 12px":28,overflowX:calMode==="anual"?"auto":"visible"}}>
          {calMode==="mensual"
            ?<MonthlyCalendar prods={prods} onClickProd={id=>goDetail(id,"calendar")} year={calYear} month={calMonth} onPrev={prevMonth} onNext={nextMonth}/>
            :<div style={{minWidth:calMode==="anual"&&isMobile?700:"auto"}}>
              <AnnualGantt prods={prods} onClickProd={id=>goDetail(id,"calendar")} year={calYear} onPrev={()=>setCalYear(y=>y-1)} onNext={()=>setCalYear(y=>y+1)}/>
            </div>
          }
        </div>
      </div>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: CHARTS
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="charts"){
    const chartData=buildChartData(prods,chartPeriod);
    const periods=[{id:"mes",label:"Mes"},{id:"cuatri",label:"Cuatri"},{id:"semestre",label:"Semestre"},{id:"año",label:"Año"}];
    return <Layout>
      <div style={{maxWidth:1140,margin:"0 auto",padding:isMobile?"16px 14px":"40px 32px"}} className="fu page-content">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:28,flexWrap:"wrap",gap:14}}>
          <div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?26:38,color:C.text,marginBottom:4}}>Gráficos</h1>
            <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase"}}>Evolución de producción e inversión</p>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{periods.map(p=><button key={p.id} className={`period-btn ${chartPeriod===p.id?"active":""}`} onClick={()=>setChartPeriod(p.id)}>{p.label}</button>)}</div>
        </div>
        {chartData.length===0?<div style={{textAlign:"center",padding:"60px 0",border:`1px dashed ${C.border}`,color:C.muted,fontSize:14}}>Sin datos suficientes.</div>:<>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:isMobile?"16px 10px":28,marginBottom:16}}>
            <div style={{marginBottom:18}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.text,marginBottom:3}}>Prendas producidas</div><div style={{fontSize:10,color:C.muted,letterSpacing:2}}>UNIDADES POR PERÍODO</div></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{top:0,right:0,bottom:0,left:isMobile?0:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#171717" vertical={false}/>
                <XAxis dataKey="period" tick={{fill:C.muted,fontSize:9,fontFamily:"DM Mono"}} axisLine={{stroke:C.border}} tickLine={false}/>
                <YAxis tick={{fill:C.muted,fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false} width={isMobile?28:40}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="unidades" name="Unidades" fill={C.gold} radius={[2,2,0,0]} maxBarSize={50}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:isMobile?"16px 10px":28,marginBottom:16}}>
            <div style={{marginBottom:18}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.text,marginBottom:3}}>Inversión acumulada</div><div style={{fontSize:10,color:C.muted,letterSpacing:2}}>PESOS POR PERÍODO</div></div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{top:0,right:0,bottom:0,left:isMobile?0:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#171717" vertical={false}/>
                <XAxis dataKey="period" tick={{fill:C.muted,fontSize:9,fontFamily:"DM Mono"}} axisLine={{stroke:C.border}} tickLine={false}/>
                <YAxis tick={{fill:C.muted,fontSize:9,fontFamily:"DM Mono"}} axisLine={false} tickLine={false} width={isMobile?28:40} tickFormatter={v=>"$"+Math.round(v/1000)+"K"}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line type="monotone" dataKey="inversion" name="Inversión" stroke={C.gold} strokeWidth={2.5} dot={{fill:C.gold,r:3,strokeWidth:0}} activeDot={{r:5,fill:C.goldL}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,background:"#0a0a0a"}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.text}}>Resumen</div></div>
            {chartData.map((row,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"14px 18px",borderBottom:i<chartData.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:12,color:C.textSub}}>{row.period}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.text}}>{row.unidades} u.</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.gold}}>${row.inversion.toLocaleString("es-AR")}</div>
            </div>)}
          </div>
        </>}
      </div>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: SIMULATOR
  // ══════════════════════════════════════════════════════════════════════════
  if(view==="simulator"){
    const su=Object.values({tela:sim.tela,estampa:sim.estampa,corte:sim.corte,avios:sim.avios}).reduce((a,v)=>a+Number(v),0);
    const sT=su*sim.qty;const sK=(sim.weight*sim.qty)/1000;
    return <Layout>
      <div style={{maxWidth:1000,margin:"0 auto",padding:isMobile?"16px 14px":"40px 32px"}} className="fu page-content">
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?26:38,color:C.text,marginBottom:4}}>Simulador de costos</h1>
        <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:28}}>Calculá cuánto te sale producir cualquier cantidad</p>
        <div className="grid-2">
          <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"22px 18px"}}>
            {[["Tipo de tela",<select key="f" className="inp" value={sim.fabric} onChange={e=>setSim(s=>({...s,fabric:e.target.value}))}>{FABRICS.map(f=><option key={f}>{f}</option>)}</select>],
              ["Peso por prenda (g)",<input key="w" className="inp" type="number" value={sim.weight} onChange={e=>setSim(s=>({...s,weight:+e.target.value}))}/>],
              ["Cantidad a producir",<input key="q" className="inp" style={{fontSize:isMobile?24:30,fontFamily:"'Playfair Display',serif",color:C.gold}} type="number" value={sim.qty} onChange={e=>setSim(s=>({...s,qty:+e.target.value}))}/>],
            ].map(([l,el],i)=><div key={i} style={{marginBottom:18}}><label style={LBL}>{l}</label>{el}</div>)}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:20}}>
              <div style={{...SECT,marginTop:0,fontSize:16}}>Costos unitarios ($)</div>
              {[["tela","Tela"],["estampa","Estampa"],["corte","Corte & Conf."],["avios","Avíos"]].map(([k,l])=>(
                <div key={k} style={{marginBottom:14}}><label style={LBL}>{l}</label><input className="inp" type="number" value={sim[k]} onChange={e=>setSim(s=>({...s,[k]:+e.target.value}))}/></div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:C.panel,border:`1px solid ${C.gold}28`,padding:"26px 22px",position:"relative"}}>
              <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:C.gold}}/>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:10}}>Costo unitario</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?40:50,color:C.gold,lineHeight:1}}>${su.toLocaleString("es-AR")}</div>
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"26px 22px",position:"relative"}}>
              <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:C.textSub}}/>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:10}}>Total — {sim.qty} unidades</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?32:40,color:C.text,lineHeight:1}}>${sT.toLocaleString("es-AR")}</div>
            </div>
            <div className="grid-2" style={{gap:10}}>
              {[{v:sK.toFixed(1)+" kg",l:"Tela estimada"},{v:sim.fabric.split(" ")[0],l:"Tipo"}].map((k,i)=>(
                <div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,padding:"16px 14px",position:"relative"}}>
                  <div style={{position:"absolute",top:0,left:0,width:2,height:"100%",background:C.gold+"66"}}/>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.gold}}>{k.v}</div>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginTop:4}}>{k.l}</div>
                </div>
              ))}
            </div>
            <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"18px 16px"}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase",marginBottom:14}}>Composición</div>
              {[["tela","Tela"],["estampa","Estampa"],["corte","Corte & Conf."],["avios","Avíos"]].map(([k,l])=>{
                const pct=su>0?(Number(sim[k])/su)*100:0;
                return <div key={k} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span style={{color:C.textSub}}>{l}</span><span style={{color:C.gold}}>{pct.toFixed(1)}%</span></div>
                  <div className="pbg"><div className="pfill" style={{width:pct+"%",background:C.gold}}/></div>
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VIEW: DASHBOARD (default)
  // ══════════════════════════════════════════════════════════════════════════
  const totalAllU=prods.reduce((a,p)=>a+totalUnitsOf(p.models),0);
  const totalAllI=prods.reduce((a,p)=>a+unitCostOf(p.costs)*totalUnitsOf(p.models),0);
  const inProc=prods.filter(p=>p.stage!=="terminado").length;
  const urgentCount=prods.filter(p=>{const d=daysLeft(p.deadline);return d!==null&&d<=5&&p.stage!=="terminado";}).length;

  return <Layout right={<button className="btn-p" style={{padding:"10px 20px",fontSize:9}} onClick={startNew}>+ Nueva</button>}>
    <div style={{maxWidth:1320,margin:"0 auto",padding:isMobile?"16px 14px":"40px 32px"}} className="fu page-content">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?28:44,color:C.text,lineHeight:1,marginBottom:6}}>Dashboard</h1>
          <p style={{fontSize:10,color:C.muted,letterSpacing:2.5,textTransform:"uppercase"}}>{new Date().toLocaleDateString("es-AR",{weekday:isMobile?"short":"long",year:"numeric",month:"long",day:"numeric"})}</p>
        </div>
        {isMobile&&<button className="btn-p" style={{padding:"12px 22px"}} onClick={startNew}>+ Nueva producción</button>}
      </div>

      <div className="grid-4" style={{marginBottom:32}}>
        <Stat value={prods.length} label="Producciones"/>
        <Stat value={inProc} label="En proceso" accent={C.amber}/>
        <Stat value={totalAllU.toLocaleString("es-AR")} label="Unidades" accent="#60a5fa"/>
        <Stat value={"$"+Math.round(totalAllI/1000)+"K"} label="Inversión" accent={C.green}/>
      </div>

      {urgentCount>0&&<div style={{background:"#120a00",border:`1px solid ${C.amber}28`,padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:16,color:C.amber}}>⚠</span>
        <span style={{fontSize:12,color:C.amber,letterSpacing:1}}>{urgentCount} producción{urgentCount>1?"es":""} con fecha límite en ≤5 días</span>
      </div>}

      {prods.length===0
        ?<div style={{textAlign:"center",padding:"60px 0",border:`1px dashed ${C.border}`}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:"#1e1e1e",marginBottom:16}}>Sin producciones</div>
          <button className="btn-p" onClick={startNew}>+ Nueva producción</button>
        </div>
        :<div style={{display:"flex",flexDirection:"column",gap:5}}>
          {STAGES.map(st=>{
            const stagProds=prods.filter(p=>p.stage===st.id);
            return <div key={st.id} style={{display:"flex",alignItems:"stretch",border:`1px solid ${C.border}`,background:C.panel,overflow:"hidden",minHeight:60}}>
              <div style={{width:isMobile?90:170,background:"#090909",borderRight:`1px solid ${C.border}`,padding:isMobile?"12px 10px":"16px 18px",display:"flex",flexDirection:"column",justifyContent:"center",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                  <span style={{fontSize:isMobile?8:10,color:st.color,letterSpacing:isMobile?1:2,textTransform:"uppercase",fontWeight:500}}>{isMobile?st.short:st.label}</span>
                </div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?18:22,color:stagProds.length>0?C.text:"#222"}}>
                  {stagProds.length}<span style={{fontSize:isMobile?9:12,color:C.muted,marginLeft:4}}>{stagProds.length===1?"orden":"órd."}</span>
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,padding:10,flex:1,alignItems:"center",overflowX:isMobile?"auto":"visible"}}>
                {stagProds.length===0&&<span style={{color:"#202020",fontSize:12,padding:"0 6px"}}>—</span>}
                {stagProds.map(prod=>{
                  const uc2=unitCostOf(prod.costs);
                  const totalU2=totalUnitsOf(prod.models);
                  const tasks=STAGE_TASKS[prod.stage]||[];
                  const doneT=tasks.filter(t=>prod.tasks[t.id]).length;
                  const pct2=tasks.length>0?Math.round((doneT/tasks.length)*100):0;
                  const days=daysLeft(prod.deadline);
                  const urgent=days!==null&&days<=5&&prod.stage!=="terminado";
                  return <div key={prod.id} className="hov" onClick={()=>goDetail(prod.id,"dashboard")}
                    style={{background:"#0c0c0c",border:`1px solid ${urgent?"#f59e0b35":C.border2}`,padding:"12px 14px",minWidth:180,maxWidth:260}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:C.text,marginBottom:4,lineHeight:1.3}}>{prod.name}</div>
                    <div style={{fontSize:10,color:C.textSub,marginBottom:9}}>{prod.fabric} · {totalU2}u.</div>
                    {tasks.length>0&&<div style={{marginBottom:9}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:C.muted,marginBottom:4,letterSpacing:1.5}}><span>TAREAS</span><span style={{color:pct2===100?C.green:st.color}}>{doneT}/{tasks.length}</span></div>
                      <div className="pbg"><div className="pfill" style={{width:pct2+"%",background:pct2===100?C.green:st.color}}/></div>
                    </div>}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.gold}}>${uc2.toLocaleString("es-AR")}</span>
                      {prod.deadline&&<span style={{fontSize:9,color:days<0?C.red:days<=5?C.amber:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{days<0?"VENC.":days===0?"HOY":days+"d"}</span>}
                    </div>
                  </div>;
                })}
              </div>
            </div>;
          })}
          <div className="hov" onClick={startNew} style={{marginTop:8,border:`1px dashed ${C.border}`,padding:isMobile?16:20,textAlign:"center",background:"transparent"}}>
            <div style={{fontSize:10,color:"#2a2a2a",letterSpacing:3,textTransform:"uppercase"}}>+ Nueva producción</div>
          </div>
        </div>
      }
    </div>
  </Layout>;
}
