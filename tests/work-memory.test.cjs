const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseManager } = require('../dist/services/db.js');
const { interpretWorkMemory, WORK_MEMORY_PROMPT } = require('../dist/services/work-memory.js');

test('synthesis classification does not use prefixes, file lists or keyword whitelists', () => {
  assert.equal(interpretWorkMemory({record_kind:'skip', title:'Inspected guide', facts:['Existing documentation']},true).skip,true);
  const finding = interpretWorkMemory({record_kind:'outcome', title:'Read service config',
    narrative:'部署写明并发上限八个，第九个连接永久挂起',files_modified:[]},true);
  assert.equal(finding.kind,'outcome'); assert.equal(finding.skip,false);
  assert.equal(interpretWorkMemory({record_kind:'skip'},false).skip,false);
  assert.equal(interpretWorkMemory({title:'quota exhausted; 0 settled; checkpoint retained'},true).kind,'context');
  assert.equal(interpretWorkMemory({record_kind:'bad'},true).skip,false);
  assert.equal(interpretWorkMemory({record_kind:'context',facts:null},true).kind,'context');
  assert.match(WORK_MEMORY_PROMPT,/daily_review/);
});

test('global overview keeps unregistered agents, whole text, stable cursor and unchanged legacy data', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'work-overview-'));
  const old=process.env.AGENTMEM_DB_PATH; process.env.AGENTMEM_DB_PATH=path.join(root,'fixture.db');
  const db=new DatabaseManager();
  try {
    await db.initialize();
    const make = (i, extra={}) => ({id:String(i),session_id:'s'+i,project_path:i%2?'E:/New/Unregistered':'E:/Vault',
      agent_id:i%2?'grok':'codex',title:'Read config '+i,narrative:'部署写明并发上限八个，第九个连接永久挂起',
      facts:[],concepts:[],files_read:[],files_modified:[],embedding:[],created_at:'2026-10-12 15:00:00',...extra});
    await db.saveSession({id:'review',project_path:'E:/Vault',agent_id:'codex',status:'active',purpose:'daily_review'});
    await db.saveSession({id:'review',project_path:'',agent_id:'',status:'completed'});
    assert.equal(await db.getSessionPurpose('review'),'daily_review');
    for(let i=0;i<23;i++) await db.saveObservation(make(i,i?{record_kind:'outcome',source_kind:'tool'}:{}));
    await db.saveObservation(make('huge',{narrative:'x'.repeat(60000)+' a result at the end',record_kind:'outcome'}));
    const before = await db.getTimeline('E:/Vault');
    const args=['2026-10-12T14:59:59.500Z','2026-10-12T16:00:00Z'];
    const first=await db.getWorkOverview(...args);
    assert.equal(first.projects.reduce((n,p)=>n+p.observations,0),24);
    assert.ok(first.projects.some(p=>p.project_path==='E:/New/Unregistered'));
    assert.equal(first.legacy_samples[0].kind,'legacy');
    assert.equal(first.legacy_samples[0].narrative,'部署写明并发上限八个，第九个连接永久挂起');
    await db.saveObservation(make('late',{record_kind:'context'}));
    let all=[...first.memories], cursor=first.next_cursor;
    while(cursor){const next=await db.getWorkOverview(...args,cursor); all.push(...next.memories); cursor=next.next_cursor; assert.deepEqual(next.projects,[]);}
    assert.equal(all.length,23); assert.equal(new Set(all.map(m=>m.id)).size,23);
    assert.equal(all.find(m=>m.id==='huge').detail_required,true);
    assert.ok(!('narrative' in all.find(m=>m.id==='huge')));
    assert.deepEqual((await db.getTimeline('E:/Vault')).filter(m=>m.id!=='late'),before);
    await assert.rejects(db.getWorkOverview(args[0],'2026-10-13T00:00:00Z',first.next_cursor),/cursor conflicts/);
    await assert.rejects(db.getWorkOverview('bad',args[1]),/valid/);
    db.close(); await db.initialize();
    assert.equal((await db.getWorkOverview(...args)).legacy_samples[0].kind,'legacy');
  } finally {
    db.close(); if(old===undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH=old;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
