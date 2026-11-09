(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 620, P = { l: 38, r: 962, t: 42, b: 578 };
  const $ = (id) => document.getElementById(id);
  const homeScoreEl = $('homeScore'), awayScoreEl = $('awayScore'), clockEl = $('clock');
  const centerTip = $('centerTip'), statusText = $('statusText'), hintEl = $('gameHint');
  const powerFill = $('powerFill'), powerText = $('powerText'), goalFlash = $('goalFlash');
  let state = 'ready', paused = false, timeLeft = 90, homeScore = 0, awayScore = 0;
  let lastTime = 0, shootCharge = 0, soundOn = true, audioCtx = null, goalTimer = 0, goalPending = false;
  const keys = new Set();
  const touch = { x: 0, y: 0, active: false, shoot: false };
  const teams = { home: [], away: [] };
  const ball = { x: 500, y: 310, vx: 0, vy: 0, owner: null, r: 10, spin: 0 };
  const player = (team, x, y, role, number) => ({team,x,y,vx:0,vy:0,role,number,r:18,faceX:team==='home'?1:-1,faceY:0,stamina:1, kickCooldown:0, speed:role==='user'?220:role==='striker'?138:125});
  function setup() {
    teams.home = [player('home', 382, 310, 'user', 10), player('home', 300, 190, 'striker', 7), player('home', 300, 430, 'wing', 11)];
    teams.away = [player('away', 642, 310, 'striker', 9), player('away', 700, 190, 'wing', 8), player('away', 700, 430, 'wing', 4)];
    ball.x = 500; ball.y = 310; ball.vx = 0; ball.vy = 0; ball.owner = null;
    shootCharge = 0;
  }
  setup();

  function audio(type) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === 'goal') { osc.type='triangle'; osc.frequency.setValueAtTime(520,now); osc.frequency.exponentialRampToValueAtTime(880,now+.22); gain.gain.setValueAtTime(.09,now); gain.gain.exponentialRampToValueAtTime(.001,now+.55); osc.start(now); osc.stop(now+.56); }
      else if (type === 'kick') { osc.type='sine'; osc.frequency.setValueAtTime(180,now); osc.frequency.exponentialRampToValueAtTime(60,now+.1); gain.gain.setValueAtTime(.07,now); gain.gain.exponentialRampToValueAtTime(.001,now+.11); osc.start(now); osc.stop(now+.12); }
      else { osc.type='sine'; osc.frequency.value=300; gain.gain.setValueAtTime(.04,now); gain.gain.exponentialRampToValueAtTime(.001,now+.08); osc.start(now); osc.stop(now+.09); }
    } catch (_) {}
  }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function normalize(x,y){const m=Math.hypot(x,y)||1;return {x:x/m,y:y/m};}
  function userMove() {
    let x = (keys.has('ArrowRight')||keys.has('d')||keys.has('D')?1:0) - (keys.has('ArrowLeft')||keys.has('a')||keys.has('A')?1:0);
    let y = (keys.has('ArrowDown')||keys.has('s')||keys.has('S')?1:0) - (keys.has('ArrowUp')||keys.has('w')||keys.has('W')?1:0);
    if (touch.active) { x = touch.x; y = touch.y; }
    const n = Math.hypot(x,y); if(n>1){x/=n;y/=n;} return {x,y};
  }
  function holdShot(){return keys.has(' ') || touch.shoot;}
  function startMatch(){
    if(state==='ended'){homeScore=0;awayScore=0;homeScoreEl.textContent='0';awayScoreEl.textContent='0';timeLeft=90;setup();}
    state='playing';paused=false;goalPending=false;centerTip.classList.add('hidden');$('pausedOverlay').classList.add('hidden');statusText.textContent='MATCH IN PROGRESS';hintEl.textContent='Find the ball. Find the net.';lastTime=performance.now();audio('tap');
  }
  $('playButton').addEventListener('click', startMatch);
  $('soundButton').addEventListener('click',()=>{soundOn=!soundOn;$('soundIcon').textContent=soundOn?'♫':'♪';$('soundButton').style.color=soundOn?'#c8f169':'#778196';if(soundOn)audio('tap');});
  window.addEventListener('keydown',e=>{
    const key=e.key;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(key))e.preventDefault();
    keys.add(key);
    if((key==='p'||key==='P') && state==='playing'){paused=!paused;$('pausedOverlay').classList.toggle('hidden',!paused);statusText.textContent=paused?'MATCH PAUSED':'MATCH IN PROGRESS';if(!paused)lastTime=performance.now();}
    if((key==='Enter') && state==='ready')startMatch();
  });
  window.addEventListener('keyup',e=>{
    if(e.key===' ' && shootCharge>0)shoot();
    keys.delete(e.key);
  });
  window.addEventListener('blur',()=>keys.clear());

  const stick = $('touchStick'), knob = $('stickKnob');
  function stickUpdate(e){
    const rect=stick.getBoundingClientRect(), cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    let dx=e.clientX-cx,dy=e.clientY-cy;const max=rect.width*.31,mag=Math.hypot(dx,dy);if(mag>max){dx=dx/mag*max;dy=dy/mag*max;}
    touch.x=dx/max;touch.y=dy/max;touch.active=true;knob.style.transform=`translate(${dx}px,${dy}px)`;
  }
  stick.addEventListener('pointerdown',e=>{e.preventDefault();stick.setPointerCapture(e.pointerId);stickUpdate(e);});
  stick.addEventListener('pointermove',e=>{if(touch.active)stickUpdate(e);});
  const releaseStick=()=>{touch.active=false;touch.x=touch.y=0;knob.style.transform='translate(0,0)';};
  stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
  $('touchShoot').addEventListener('pointerdown',e=>{e.preventDefault();touch.shoot=true;$('touchShoot').classList.add('pressed');});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>$('touchShoot').addEventListener(ev,()=>{if(touch.shoot)shoot();touch.shoot=false;$('touchShoot').classList.remove('pressed');}));

  function shoot() {
    if(state!=='playing'||paused)return;
    const me=teams.home[0];
    const near=ball.owner===me||(!ball.owner&&Math.hypot(ball.x-me.x,ball.y-me.y)<58);
    if(!near){shootCharge=0;powerFill.style.width='0%';powerText.textContent='READY';return;}
    const strength=.48+Math.min(shootCharge,1)*.52;
    let dx=me.faceX*.72+.72, dy=me.faceY*.72;
    if(ball.owner!==me){dx=1;dy=(310-ball.y)*.002;}
    const d=normalize(dx,dy);
    ball.owner=null;ball.x=me.x+d.x*25;ball.y=me.y+d.y*25;ball.vx=d.x*(430+strength*300);ball.vy=d.y*(430+strength*300);ball.spin=0.25;me.kickCooldown=.4;
    shootCharge=0;powerFill.style.width='0%';powerText.textContent='READY';audio('kick');
  }

  function update(dt){
    if(state!=='playing'||paused||goalPending)return;
    timeLeft-=dt;if(timeLeft<=0){timeLeft=0;state='ended';statusText.textContent='FULL TIME';centerTip.classList.remove('hidden');centerTip.querySelector('.tip-kicker').textContent='FULL TIME';centerTip.querySelector('h2').textContent=homeScore>awayScore?'A WIN FOR THE COMETS!':homeScore<awayScore?'THE ROCKETS TAKE IT':'A DRAW!';centerTip.querySelector('p').textContent=`Final score ${homeScore} — ${awayScore}. Ready for a rematch?`;$('playButton').querySelector('span').textContent='PLAY AGAIN';hintEl.textContent='The final whistle has blown.';}
    clockEl.textContent=`${String(Math.floor(timeLeft/60)).padStart(2,'0')}:${String(Math.floor(timeLeft%60)).padStart(2,'0')}`;
    const me=teams.home[0], move=userMove();
    const charging=holdShot()&&(ball.owner===me||Math.hypot(ball.x-me.x,ball.y-me.y)<58);
    if(charging){shootCharge=Math.min(1,shootCharge+dt*.75);powerFill.style.width=`${Math.round(shootCharge*100)}%`;powerText.textContent=shootCharge>.92?'MAX POWER':`${Math.round(shootCharge*100)}%`;}
    teams.home.forEach((p,i)=>{
      p.kickCooldown=Math.max(0,p.kickCooldown-dt);
      let ix=0,iy=0,speed=p.speed;
      if(i===0){ix=move.x;iy=move.y;}
      else {
        const targetX=p.role==='striker'?ball.x-110:ball.x-185;
        const targetY=i===1?145:475;
        if(ball.owner && ball.owner.team==='home'){ix=(targetX-p.x)*.012;iy=(targetY-p.y)*.012;}
        else {ix=(ball.x-p.x)*.012;iy=(ball.y-p.y)*.012;}
        const m=Math.hypot(ix,iy);if(m>1){ix/=m;iy/=m;}
      }
      if(Math.hypot(ix,iy)>.05){const n=normalize(ix,iy);p.faceX=n.x;p.faceY=n.y;}
      p.vx=ix*speed;p.vy=iy*speed;p.x=clamp(p.x+p.vx*dt,P.l+20,P.r-20);p.y=clamp(p.y+p.vy*dt,P.t+20,P.b-20);
    });
    teams.away.forEach((p,i)=>{
      p.kickCooldown=Math.max(0,p.kickCooldown-dt);
      let ix=0,iy=0;
      const owner=ball.owner;
      if(owner===p){
        const goalY=310;ix=-1;iy=(goalY-p.y)*.012;
        if((p.x<430||Math.hypot(ball.x-38,ball.y-310)<330)&&p.kickCooldown<=0){const d=normalize(-1,(310-p.y)*.006);ball.owner=null;ball.vx=d.x*510;ball.vy=d.y*510;p.kickCooldown=1.1;audio('kick');}
      }else if(!owner || owner.team==='home'){
        const closest=i===0||Math.hypot(ball.x-p.x,ball.y-p.y)<Math.hypot(ball.x-teams.away[0].x,ball.y-teams.away[0].y);
        if(closest){ix=ball.x-p.x;iy=ball.y-p.y;}
        else {ix=(i===1?ball.x+100:ball.x+130)-p.x;iy=((i===1?170:450)-p.y);}
      }else {ix=ball.x-p.x;iy=ball.y-p.y;}
      const n=normalize(ix,iy);if(Math.hypot(ix,iy)>7){p.faceX=n.x;p.faceY=n.y;p.x=clamp(p.x+n.x*p.speed*dt,P.l+20,P.r-20);p.y=clamp(p.y+n.y*p.speed*dt,P.t+20,P.b-20);}
    });
    // Players contest possession. A player already carrying the ball keeps it at their leading foot.
    if(ball.owner){
      const o=ball.owner;ball.x=o.x+o.faceX*23;ball.y=o.y+o.faceY*23;ball.vx=o.vx*.6;ball.vy=o.vy*.6;
      const opponents=o.team==='home'?teams.away:teams.home;
      for(const p of opponents){if(Math.hypot(p.x-o.x,p.y-o.y)<30){ball.owner=p;audio('tap');break;}}
    }else{
      ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;const drag=Math.pow(.986,dt*60);ball.vx*=drag;ball.vy*=drag;ball.spin+=dt*12;
      const all=[...teams.home,...teams.away];
      for(const p of all){if(p.kickCooldown<=0&&Math.hypot(ball.x-p.x,ball.y-p.y)<p.r+ball.r+5){ball.owner=p;ball.vx=ball.vy=0;if(p===me)hintEl.textContent='You have the ball. Line up your shot!';break;}}
    }
    if(ball.y<P.t+ball.r||ball.y>P.b-ball.r){ball.y=clamp(ball.y,P.t+ball.r,P.b-ball.r);ball.vy*=-.72;}
    if(ball.x<P.l-ball.r||ball.x>P.r+ball.r){
      const inGoal=ball.y>220&&ball.y<400;
      if(inGoal){if(ball.x<P.l)awayScore++;else homeScore++;homeScoreEl.textContent=homeScore;awayScoreEl.textContent=awayScore;goal();return;}
      ball.x=clamp(ball.x,P.l+ball.r,P.r-ball.r);ball.vx*=-.7;
    }
  }
  function goal(){if(goalPending)return;goalPending=true;audio('goal');goalFlash.classList.add('show');goalTimer=1.5;hintEl.textContent='What a finish! Get ready for kickoff.';setTimeout(()=>{goalFlash.classList.remove('show');setup();goalPending=false;},850);}

  function drawField(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#267b46';ctx.fillRect(0,0,W,H);
    const stripes=12;for(let i=0;i<stripes;i++){ctx.fillStyle=i%2?'#ffffff08':'#092d1b08';ctx.fillRect(P.l+i*(P.r-P.l)/stripes,P.t,(P.r-P.l)/stripes,P.b-P.t);}
    // outer trim and pitch lines
    ctx.strokeStyle='#e7f5e8cc';ctx.lineWidth=3;ctx.strokeRect(P.l,P.t,P.r-P.l,P.b-P.t);
    ctx.beginPath();ctx.moveTo(W/2,P.t);ctx.lineTo(W/2,P.b);ctx.stroke();
    ctx.beginPath();ctx.arc(W/2,H/2,72,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#f4faed';ctx.beginPath();ctx.arc(W/2,H/2,3.5,0,Math.PI*2);ctx.fill();
    // penalty boxes
    ctx.strokeRect(P.l,P.t+128,112,260);ctx.strokeRect(P.l,P.t+188,45,140);
    ctx.strokeRect(P.r-112,P.t+128,112,260);ctx.strokeRect(P.r-45,P.t+188,45,140);
    ctx.beginPath();ctx.arc(P.l+78,H/2,2.7,0,Math.PI*2);ctx.arc(P.r-78,H/2,2.7,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(P.l+78,H/2,47,-.92,.92);ctx.stroke();ctx.beginPath();ctx.arc(P.r-78,H/2,47,Math.PI-.92,Math.PI+.92);ctx.stroke();
    // goals / net
    for(const x of [6,W-26]){ctx.fillStyle='#e7f3e5';ctx.fillRect(x,220,20,180);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x,220,20,180);ctx.strokeStyle='#ffffff55';ctx.lineWidth=1;for(let y=230;y<400;y+=13){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+20,y);ctx.stroke();}for(let xx=x+5;xx<x+20;xx+=7){ctx.beginPath();ctx.moveTo(xx,220);ctx.lineTo(xx,400);ctx.stroke();}}
    // subtle touchline dashes
    ctx.fillStyle='#ecf8e988';for(let x=70;x<950;x+=34){ctx.fillRect(x,P.t-10,13,2);ctx.fillRect(x,P.b+8,13,2);}
  }
  function drawPlayer(p){
    const isHome=p.team==='home',user=p.role==='user';
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#06110c44';ctx.beginPath();ctx.ellipse(2,13,18,8,0,0,Math.PI*2);ctx.fill();
    // trailing shadow / kit
    const color=isHome?'#4d83f2':'#f05268',dark=isHome?'#2857ba':'#b7354c',highlight=isHome?'#a7c3ff':'#ffb0b8';
    ctx.rotate(Math.atan2(p.faceY,p.faceX));
    ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(-1,3,14,16,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,0,13,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=highlight;ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(-4,-6,4,8,-.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle='#ffffff9a';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(0,10);ctx.stroke();
    ctx.fillStyle='#f2d5b9';ctx.beginPath();ctx.arc(0,-15,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#27232c';ctx.beginPath();ctx.arc(1,-18,6,-Math.PI,0);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.font=`800 ${user?10:9}px 'DM Sans'`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(p.number),0,1);
    ctx.restore();
    if(user&&state==='playing'){
      ctx.fillStyle='#d5f78b';ctx.beginPath();ctx.moveTo(p.x,p.y-31);ctx.lineTo(p.x-5,p.y-38);ctx.lineTo(p.x+5,p.y-38);ctx.closePath();ctx.fill();
      if(ball.owner===p&&shootCharge>.05){ctx.strokeStyle='#d6f58b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,25,-Math.PI/2,-Math.PI/2+Math.PI*2*shootCharge);ctx.stroke();}
    }
  }
  function drawBall(){
    ctx.fillStyle='#06110c55';ctx.beginPath();ctx.ellipse(ball.x+3,ball.y+8,12,6,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(ball.x,ball.y);ctx.rotate(ball.spin);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,ball.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c9d0ce';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#252a31';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*5.5,Math.sin(a)*5.5,2.3,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  function draw(){
    drawField();
    const all=[...teams.home,...teams.away].sort((a,b)=>a.y-b.y);all.forEach(drawPlayer);drawBall();
    // shot charge glow
    if(shootCharge>.05){ctx.fillStyle=`rgba(200,241,105,${shootCharge*.05})`;ctx.fillRect(P.l,P.t,P.r-P.l,P.b-P.t);}
  }
  function loop(now){
    const dt=Math.min((now-lastTime)/1000||0,.04);lastTime=now;update(dt);draw();
    if(goalTimer>0){goalTimer-=dt;if(goalTimer<=0){}}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // Provide a useful initial clock before kickoff.
  clockEl.textContent='01:30';
})();
