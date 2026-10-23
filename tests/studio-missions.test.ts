import {it,expect,vi} from 'vitest';
vi.mock('../src/db',()=>({pool:{query:vi.fn(async()=>({rows:[],rowCount:0}))}}));
vi.mock('../src/lib/settings',()=>({getSetting:vi.fn(async()=>({clay:'studio',motion:'engine'}))}));
import {studioNotificationText,fulfilmentMode,type StudioMission} from '../src/lib/studio/missions';
const mission:StudioMission={id:'0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',jobId:'1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f',category:'clay',version:2,title:'Test studio',script:'Jews control the media? Really?',feedback:[{text:'Scène 4 pas claire.',scene:4},{text:'Trop sombre.',seconds:12.3}],priceCents:300,state:'queued',mediaPath:null,mediaSha256:null,notes:null,createdAt:'2026-10-23T08:00:00.000Z',deliveredAt:null};
it('writes a complete Telegram mission for Shimi with the script, the approved price and the client feedback',()=>{
 const text=studioNotificationText(mission,'https://cam.example');
 expect(text).toContain('mission clay V2');expect(text).toContain('Prix approuvé : 3 $');expect(text).toContain('https://cam.example/admin/studio');expect(text).toContain('Jews control the media?');expect(text).toContain('scène 4 : Scène 4 pas claire.');expect(text).toContain('à 12.3 s : Trop sombre.');
});
it('reads the fulfilment mode per category with engine as default',async()=>{
 expect(await fulfilmentMode('clay')).toBe('studio');expect(await fulfilmentMode('motion')).toBe('engine');expect(await fulfilmentMode('comics')).toBe('engine');
});
