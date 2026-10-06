import { newProject, newScene, type ImageAsset, type Locale, type Project } from './model';

function screenshot(next:boolean,mobile:boolean):ImageAsset {
  const canvas=document.createElement('canvas');canvas.width=mobile?390:1280;canvas.height=mobile?780:800;
  const ctx=canvas.getContext('2d')!;
  const box=(x:number,y:number,w:number,h:number,color:string,r=12)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
  const text=(s:string,x:number,y:number,size=18,color='#0f172a',weight=500)=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui, sans-serif`;ctx.textBaseline='top';ctx.fillText(s,x,y);};
  ctx.fillStyle='#f1f5f9';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(mobile) {
    box(0,0,390,80,'#ffffff',0);text('planly',24,26,25,'#2563eb',800);text('MY WORKSPACE',24,112,13,'#64748b',700);
    text('Today’s tasks',24,143,30,'#0f172a',750);
    box(24,204,342,next?60:100,'#ffffff');text(next?'Search all tasks...':'Search project...',42,223,16,'#64748b');
    if(!next){box(42,259,136,29,'#e2e8f0',6);text('Filter project',52,265,14);box(192,259,148,29,'#e2e8f0',6);text('Filter status',204,265,14);}
    const start=next?292:338;
    ['Ship search update','Review release notes','Fix mobile layout'].forEach((task,i)=>{
      const y=start+i*118;box(24,y,342,98,'#ffffff');box(42,y+24,24,24,i===0&&next?'#2563eb':'#e2e8f0',6);
      text(task,78,y+24,16,'#0f172a',600);text(i===0?'Release 1.5':'This week',78,y+53,13,'#64748b');
      if(next){box(270,y+56,76,23,'#dcfce7',6);text('Ready',284,y+61,11,'#166534',600);}
    });
    if(next){box(0,711,390,69,'#ffffff',0);text('Tasks',44,735,16,'#2563eb',700);text('Projects',153,735,16,'#64748b');text('Settings',276,735,16,'#64748b');}
  } else {
    box(0,0,235,800,'#ffffff',0);text('planly',32,30,30,'#2563eb',800);text('WORKSPACE',32,105,12,'#94a3b8',700);
    ['Overview','My tasks','Projects','Release notes'].forEach((s,i)=>{if(i===1)box(18,179,198,44,'#eff6ff',8);text(s,36,140+i*50,17,i===1?'#2563eb':'#64748b',i===1?700:500);});
    text('Today’s tasks',278,44,33,'#0f172a',750);text('A clear view of your next release.',280,94,17,'#64748b');
    box(1082,42,146,43,'#2563eb',8);text('+ New task',1102,55,16,'#ffffff',650);
    if(next) {box(278,149,947,74,'#ffffff');box(296,165,690,42,'#f8fafc',8);text('Search all tasks, projects and labels...',312,177,17,'#64748b');box(1007,166,195,40,'#dbeafe',8);text('All projects',1030,177,16,'#1d4ed8',650);}
    else {box(278,149,947,175,'#ffffff');text('Find a task',300,171,18,'#334155',650);box(300,212,904,42,'#f1f5f9',7);text('Search by task name...',316,224,16,'#64748b');box(300,269,267,36,'#e2e8f0',7);text('Select project',314,278,15,'#64748b');box(589,269,267,36,'#e2e8f0',7);text('Select status',603,278,15,'#64748b');}
    const start=next?257:358;
    text(next?'Everything you need, in one search':'ACTIVE TASKS',280,start,15,next?'#2563eb':'#64748b',650);
    ['Ship search update','Review release notes','Fix mobile layout','Prepare GIF for README'].forEach((s,i)=>{
      const y=start+42+i*88;box(278,y,947,72,'#ffffff');box(299,y+24,22,22,i===0&&next?'#2563eb':'#e2e8f0',5);
      text(s,341,y+15,18,'#0f172a',650);text('Release 1.5 · Product',341,y+42,13,'#64748b');
      box(1040,y+23,150,27,next?'#dcfce7':'#fef3c7',6);text(next?'Ready to ship':'In progress',1060,y+30,12,next?'#166534':'#92400e',650);
    });
  }
  return {id:crypto.randomUUID(),name:`planly-${mobile?'mobile':'search'}-${next?'after':'before'}.png`,dataUrl:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};
}

/** Fictional interface fixtures created here; no third-party product screenshots. */
export function sampleProject(locale:Locale):Project {
  const project=newProject();project.locale=locale;project.title='Planly · Release 1.5';
  project.beforeLabel=locale==='zh'?'旧版 · 1.4':'Before · 1.4';project.afterLabel=locale==='zh'?'新版 · 1.5':'After · 1.5';project.template='wipe';
  const search=newScene();search.title=locale==='zh'?'一个搜索框，找到全部任务':'One search. Every task.';
  search.caption=locale==='zh'?'把分散的搜索与筛选合并为一个清晰入口。':'Bring separate search and filters into one clear entry point.';
  search.before=screenshot(false,false);search.after=screenshot(true,false);search.focus={x:.21,y:.17,width:.75,height:.3};
  const mobile=newScene();mobile.title=locale==='zh'?'移动布局，更轻松地查看进度':'A calmer layout on mobile';
  mobile.caption=locale==='zh'?'紧凑的搜索、清晰的状态，给任务内容更多空间。':'Compact search and clear status give tasks more room.';
  mobile.before=screenshot(false,true);mobile.after=screenshot(true,true);mobile.focus={x:.05,y:.25,width:.9,height:.65};
  project.scenes=[search,mobile];return project;
}
