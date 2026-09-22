import React, { useState } from 'react';
const steps=[
 {id:'talk',icon:'💬',title:'Conversa',text:'A pessoa conta o que precisa, do jeito que souber.'},
 {id:'brief',icon:'📝',title:'Briefing',text:'A conversa vira objetivos, público e prioridades.'},
 {id:'analyze',icon:'🔎',title:'Análise',text:'O assistente identifica oportunidades e melhorias.'},
 {id:'approve',icon:'✅',title:'Aprovação',text:'A pessoa decide o que pode ser executado.'},
 {id:'execute',icon:'⚙️',title:'Execução',text:'Agentes especializados realizam a tarefa.'},
 {id:'learn',icon:'📈',title:'Acompanhamento',text:'O CRM registra o resultado e o radar acompanha.'}
];
export default function EcosystemFlow(){const [active,setActive]=useState('talk'); const current=steps.find(s=>s.id===active)||steps[0]; return <section className="ecosystem-flow" aria-label="Como o Olho de Deus funciona"><div className="flow-heading"><div><span className="kicker">ECOSSISTEMA VISUAL</span><h2>Como o Olho de Deus ajuda</h2><p>Clique em uma etapa para entender o caminho.</p></div><span className="access-pill">♿ Leitura simples</span></div><div className="flow-track">{steps.map((s,i)=><React.Fragment key={s.id}><button className={'flow-node '+(active===s.id?'active':'')} onClick={()=>setActive(s.id)} aria-pressed={active===s.id}><span className="flow-emoji">{s.icon}</span><strong>{s.title}</strong><small>{i+1}</small></button>{i<steps.length-1&&<span className="flow-arrow" aria-hidden="true">→</span>}</React.Fragment>)}</div><div className="flow-detail"><span className="detail-icon">{current.icon}</span><div><strong>{current.title}</strong><p>{current.text}</p></div></div></section>}
