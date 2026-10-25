"use strict";
// Adversarial review: uses only the isolated browser harness and synthetic data.
// Nonzero exit indicates unmet review expectations, not a failed runtime edit.
const fs = require("node:fs");
const path = require("node:path");
const {Module} = require("node:module");

async function seniorReviewFlows() {
 const results=[],record=(id,name,pass,observed)=>results.push({id,name,pass:!!pass,observed});
 const original=structuredClone(db), cloned=()=>structuredClone(original);
 const lesson=data=>data.schools.find(s=>s.id==="school_a").classes.find(c=>c.id==="class_a").lessons.find(l=>l.id==="lesson_dual");
 const parts=(a,b)=>[{period:{term:"اول"},data:a},{period:{term:"دوم"},data:b}];
 try {
  const tiny=cloned();lesson(tiny).kardaneshScores.student_a={practical:1e-100,theory:1e-100,midtermPractical:1e-100,midtermTheory:1e-100};
  let accepted=false,grade;try{const normalized=EduV24.normalizeDB(tiny);accepted=true;grade=EduV24.annualGradeRows(parts(normalized,structuredClone(normalized)),"school_a","class_a","student_a")[0];}catch(error){record("R01","accepted imported grades produce a finite annual result",false,{error:error.message});}
  if(accepted)record("R01","accepted imported grades produce a finite annual result",Number.isFinite(grade.final),{importAccepted:accepted,complete:grade.complete,annualFinal:String(grade.final),serializedFinal:JSON.parse(JSON.stringify(grade)).final});
  const edge=cloned();lesson(edge).kardaneshScores.student_a={practical:13.999999,theory:14,midtermPractical:13.999999,midtermTheory:14};
  const edgeRow=EduV24.annualGradeRows(parts(edge,structuredClone(edge)),"school_a","class_a","student_a")[0];
  record("R02","rounded display does not turn a failing annual grade into a pass",edgeRow.passed===false&&EduV24.finalText(edgeRow).includes("کمتر"),{final:edgeRow.final,passed:edgeRow.passed,display:EduV24.finalText(edgeRow)});
  const legacy=cloned(),legacyLesson=legacy.schools[0].classes[0].lessons.find(l=>l.id==="lesson_modular");
  delete legacyLesson.gradingPolicy;for(const pod of legacyLesson.poudmans)delete pod.podScores;
  legacyLesson.poudmans[0].units[0].unitScores.student_a={m:18,p:16};
  const validLegacy=EduV24.normalizeDB(legacy);
  const technical=EduV24.annualTechnicalRows(parts(validLegacy,structuredClone(validLegacy)),"school_a","class_a","student_a");
  const model=EduPeriodicReports.build(validLegacy,{mode:"annual",date:"2026-10-25",schoolId:"school_a",classId:"class_a",studentId:"student_a",audience:"parent",detailLevel:"summary"});
  model.technicalGrades=technical;
  const html=EduPeriodicReports.documentHtml(model),text=EduPeriodicReports.textReport(model);
  record("R03","legacy technical grade is present in annual display and text",technical.every(row=>row.final===null||html.includes(EduV24.finalText(row))&&text.includes(EduV24.finalText(row))),{rows:technical.map(row=>({term:row.term,final:row.final,modules:row.modules.length})),has1680:html.includes("16.80"),textHas1680:text.includes("16.80")});
  const priorWorkspace=EduV24.getReportContext().id,backup=await EduV24.snapshotInstallation();
  const pair=["اول","دوم"].map(term=>backup.stores.catalog.find(period=>period.year==="1407-1408"&&period.term===term));
  if(pair.some(period=>!period))throw Error("Two-term fixture missing.");
  const pairIds=new Set(pair.map(period=>period.id));
  for(const [name,rows]of Object.entries(backup.stores))backup.stores[name]=name==="catalog"?rows.filter(row=>pairIds.has(row.id)):rows.filter(row=>pairIds.has(row.workspace));
  backup.activeWorkspace=pair[1].id;backup.gradeDrafts=backup.gradeDrafts.filter(row=>pairIds.has(row.workspace));backup.reportDrafts=Object.fromEntries(Object.entries(backup.reportDrafts).filter(([id])=>pairIds.has(id)));
  const beforeIds=new Set((await EduV24.snapshotInstallation()).stores.catalog.map(period=>period.id));
  EduV24.previewFullBackup(backup);await EduV24.restoreFullBackup();
  const imported=await EduV24.listAnnualReportPeriods(),second=EduV24.getReportContext().id,first=imported.find(period=>!beforeIds.has(period.id)&&period.termKind==="first");
  let annualError="",annual;
  const originalPrompt=window.prompt;window.prompt=()=>"annual-access";
  try{annual=await EduV24.prepareReportSnapshot({annual:true,periodIds:{first:first.id,second}});}catch(error){annualError=error.message;}finally{window.prompt=originalPrompt;}
  record("R04","restored academic year can be selected for annual report",!annualError&&annual.parts[0].period.id===first.id&&annual.parts[1].period.id===second,{activeTerm:EduV24.test.getState().workspace.term,error:annualError,selected:annual?.parts.map(part=>part.period.id)});
  await EduV24.switchPeriod(priorWorkspace);
  db=cloned();
  for(const school of db.schools)for(const c of school.classes)for(const l of c.lessons){
   if(l.gradingPolicy)l.gradingPolicy.confirmed=true;
   if(l.gradeMode==="kardanesh"){
    for(const st of c.students)l.kardaneshScores[st.id]={practical:18,theory:12};
   }else for(const pod of l.poudmans)for(const st of c.students)pod.podScores[st.id]={m:2,c:2};
  }
  await saveDB();await EduV24.finalizePeriod();
  record("R05","period completeness requires midterm and final components",!EduV24.getReportContext().closed,{closed:EduV24.getReportContext().closed,midterm:EduV24.assessmentResult(db.schools[0].classes[0].lessons[0],"student_a","midterm").final,final:EduV24.assessmentResult(db.schools[0].classes[0].lessons[0],"student_a","final").final});
  if(EduV24.getReportContext().closed)await EduV24.reopenPeriod();
  closeModal();state.schoolId="school_a";state.classId="class_a";state.lessonId="lesson_dual";
  showModal("Audit invalid input",buildLessonGradesHtml(db.schools[0].classes[0],db.schools[0].classes[0].lessons[0]));
  const input=[...document.querySelectorAll("[data-grade]")].find(x=>x.dataset.student==="student_a"&&x.dataset.field==="midtermPractical");
  input.value="99";input.dispatchEvent(new Event("input",{bubbles:true}));
  let backupError="";try{await EduV24.snapshotInstallation();}catch(error){backupError=error.message;}
  record("R06","durable backup remains available with invalid uncommitted grade",!backupError,{error:backupError,drafts:EduV24.getReportContext().pendingDrafts});
  input.value="18";input.dispatchEvent(new Event("input",{bubbles:true}));await EduV24.flushDrafts({strict:true});closeModal();
  goSchool("school_a");goClass("class_a");goLesson("lesson_modular");
  const form=document.querySelector(".session-create-form");
  const existing=db.sessions.find(x=>x.lessonId==="lesson_dual");
  form.elements.date.value=existing.date;form.elements.period.value=String(existing.period+1);
  const oldConfirm=window.confirm;let confirmation="";window.confirm=message=>{confirmation=message;return true;};
  await addManualSession({preventDefault(){},target:form},"lesson_modular");window.confirm=oldConfirm;
  record("R07","starting a lesson cannot silently open another lesson's session",currentSessionId!==existing.id||confirmation.includes(db.schools[0].classes[0].lessons.find(l=>l.id==="lesson_dual").name),{requestedLesson:"lesson_modular",openedLesson:getSessionById(currentSessionId)?.lessonId,confirmation});
  closeModal();
  const before=db.sessions.find(x=>x.id===existing.id).scores.length;
  openSessionModal(getSessionById(existing.id));showSessionPanel("activity");
  const activityForm=document.querySelector(".session-entry-form");
  activityForm.elements.studentId.value="student_a";activityForm.elements.type.value="classGrade";activityForm.elements.value.value="1000";activityForm.elements.note.value="";
  let markError="";try{await addSessionScore({preventDefault(){},target:activityForm},existing.id);}catch(error){markError=error.message;}
  record("R08","class-grade control distinguishes a 0-20 grade from activity points",!!markError||getSessionById(existing.id).scores.length===before,{error:markError,storedValue:getSessionById(existing.id).scores.at(-1)?.value,controlLabel:"نمره کلاسی (۰ تا ۲۰)"});
  closeModal();
 }catch(error){record("R99","senior review flow completed",false,{error:error.stack||error.message});}
 return results;
}



async function seniorUiReview() {
 const results=[];
 document.getElementById("pwaWelcomeLater")?.click();closeModal();
 const originalName=db.schools[0].name,originalClass=db.schools[0].classes[0].name;
 db.schools[0].name="مدرسه "+ "طولانی".repeat(70);db.schools[0].classes[0].name="کلاس "+ "آزمایشی".repeat(50);
 const measure=name=>{
  const bad=[];
  for(const control of document.querySelectorAll("#app button,#app input,#app select,#app textarea,#app summary")){
   const rect=control.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   if(rect.left>=-1&&rect.right<=innerWidth+1)continue;
   let scrolled=false;for(let parent=control.parentElement;parent&&parent.id!=="app";parent=parent.parentElement){
    if(["auto","scroll"].includes(getComputedStyle(parent).overflowX)&&parent.scrollWidth>parent.clientWidth){scrolled=true;break;}
   }
   if(!scrolled)bad.push({text:(control.getAttribute("aria-label")||control.textContent||control.name).slice(0,70),left:Math.round(rect.left),right:Math.round(rect.right)});
  }
  results.push({id:"U-"+name,name:"320px long names: interactive controls remain reachable in "+name,pass:document.documentElement.scrollWidth<=innerWidth+1&&!bad.length,observed:{viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,clipped:bad}});
 };
 for(const [name,open]of [["home",()=>goSchools()],["class",()=>{goSchool("school_a");goClass("class_a");}],["lesson",()=>goLesson("lesson_dual")],["grades",()=>setTab("grades")],["reports",()=>goReports()],["annual",()=>setReportTab("annual")]]){
  open();await new Promise(resolve=>setTimeout(resolve,100));measure(name);
 }
 db.schools[0].name=originalName;db.schools[0].classes[0].name=originalClass;goSchools();
 return results;
}


async function postFixFlows(){
 const cases=[],record=(id,name,pass,observed={})=>cases.push({id,name,pass:!!pass,observed});
 const readAll=store=>new Promise((resolve,reject)=>{const q=EduV24.test.getConnection().transaction(store).objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const put=async(store,value)=>new Promise((resolve,reject)=>{const tx=EduV24.test.getConnection().transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 try{
  closeModal();
  const tiny=structuredClone(db),tinyLesson=tiny.schools[0].classes[0].lessons[0];
  for(const value of [1e-100,Number.MIN_VALUE]){
   tinyLesson.kardaneshScores.student_a={practical:value,theory:value,midtermPractical:value,midtermTheory:value};
   const normalized=EduV24.normalizeDB(tiny),rows=EduV24.annualGradeRows([{period:{term:"اول"},data:normalized},{period:{term:"دوم"},data:structuredClone(normalized)}],"school_a","class_a","student_a");
   record(value===Number.MIN_VALUE?"P02":"P01","tiny imported grade retains its finite annual value",rows[0].final===value&&JSON.parse(JSON.stringify(rows[0])).final===value,{value,annual:rows[0].final});
  }
  const session=db.sessions.find(s=>s.lessonId==="lesson_dual");
  openSessionModal(session);showSessionPanel("activity");
  for(const value of ["0","20"]){
   const form=document.querySelector(".session-entry-form");form.elements.studentId.value="student_a";form.elements.type.value="classGrade";form.elements.value.value=value;form.elements.note.value="class grade boundary";
   await addSessionScore({preventDefault(){},target:form},session.id);
   record(value==="0"?"P03":"P04","class-grade endpoint persists without changing official grade",getSessionById(session.id).scores.some(score=>score.type==="classGrade"&&score.value===Number(value))&&EduV24.assessmentResult(db.schools[0].classes[0].lessons[0],"student_a","final").final===16.2);
  }
  const form=document.querySelector(".session-entry-form");form.elements.studentId.value="student_a";form.elements.type.value="activity";form.elements.value.value="1000";form.elements.note.value="legacy-compatible points";
  await addSessionScore({preventDefault(){},target:form},session.id);
  record("P05","activity points remain distinct and keep their previous range",getSessionById(session.id).scores.some(score=>score.type==="activity"&&score.value===1000));
  const corrupt=structuredClone(db);corrupt.sessions[0].scores.push({studentId:"student_a",type:"classGrade",value:1000,note:""});
  let rejected=false;try{EduV24.normalizeDB(corrupt);}catch{rejected=true;}
  record("P06","import cannot bypass the class-grade limit",rejected);
  const legacy=structuredClone(db);legacy.schemaVersion=25;for(const row of legacy.sessions)row.scores=row.scores.filter(score=>score.type!=="classGrade");
  const migrated=EduV24.normalizeDB(legacy);
  record("P07","schema 25 keeps activity semantics during migration to 26",migrated.schemaVersion===26&&migrated.sessions.some(row=>row.scores.some(score=>score.type==="activity"&&score.value===1000)));
  const daily=EduPeriodicReports.build(db,{mode:"daily",date:session.date,schoolId:"school_a",classId:"class_a",studentId:"student_a",audience:"parent",detailLevel:"full"});
  record("P08","periodic and copied session reports label class grades",daily.sessions.some(row=>row.marks.some(mark=>mark.type==="classGrade"&&mark.label==="نمره کلاسی"))&&generateSessionReportText(getSessionById(session.id),db.schools[0].classes[0],db.schools[0].classes[0].lessons[0]).includes("نمره کلاسی"));
  closeModal();
  for(const school of db.schools)for(const c of school.classes)for(const l of c.lessons){
   if(l.gradingPolicy)l.gradingPolicy.confirmed=true;
   for(const student of c.students)if(l.gradeMode==="kardanesh")l.kardaneshScores[student.id]={practical:18,theory:12,midtermPractical:18,midtermTheory:12};
   else for(const pod of l.poudmans)pod.podScores[student.id]={m:2,c:2};
  }
  await saveDB();
  const periodId=EduV24.getReportContext().id,beforeReports=(await readAll("reports")).filter(row=>row.workspace===periodId).length;
  const closes=await Promise.allSettled([EduV24.finalizePeriod(),EduV24.finalizePeriod()]);
  const frozenRows=(await readAll("reports")).filter(row=>row.workspace===periodId);
  record("P09","concurrent term closing issues exactly one frozen report",EduV24.getReportContext().closed&&frozenRows.length===beforeReports+1,{fulfilled:closes.filter(item=>item.status==="fulfilled").length,issued:frozenRows.length-beforeReports});
  const frozen=frozenRows.at(-1),frozenGrade=frozen.classes[0].students[0].lessons[0];
  record("P10","frozen report preserves both raw assessment pairs",frozenGrade.assessments?.version===1&&frozenGrade.assessments.midterm.final===16.2&&frozenGrade.assessments.final.final===16.2);
  await EduV24.showFrozenReport(frozen.id);
  record("P11","both assessments are visible in the frozen report",document.getElementById("modalBody").textContent.includes("میان‌ترم")&&!document.getElementById("modalBody").textContent.includes("undefined"));
  const historical=structuredClone(frozen);historical.id="legacy_report_without_assessments";for(const c of historical.classes)for(const st of c.students)for(const l of st.lessons)delete l.assessments;
  await put("reports",historical);await EduV24.showFrozenReport(historical.id);
  record("P12","historical frozen report remains readable without fabricated midterm",document.getElementById("modalBody").textContent.includes("ثبت نشده در نسخه قدیمی"));
  const badBackup=await EduV24.snapshotInstallation(),badFrozen=badBackup.stores.reports.find(row=>row.id===frozen.id);
  badFrozen.classes[0].students[0].lessons[0].assessments.midterm.practical=99;
  let badRejected=false;try{EduV24.validateFullBackup(badBackup);}catch{badRejected=true;}
  record("P13","malformed frozen midterm cannot enter a full restore",badRejected);
  closeModal();await EduV24.reopenPeriod();closeModal();
  const immutableBefore=JSON.stringify((await readAll("reports")).find(row=>row.id===frozen.id));
  db.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical=19;await saveDB();
  record("P14","editing reopened term never rewrites its previous frozen assessments",JSON.stringify((await readAll("reports")).find(row=>row.id===frozen.id))===immutableBefore);
  db.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical=18;await saveDB();
  const firstId=EduV24.getReportContext().id,year=EduV24.test.getState().workspace.year;
  await EduV24.openNewPeriod();document.getElementById("periodYear").value=year;document.getElementById("periodTerm").value="دوم";await EduV24.createNewPeriod();
  const secondId=EduV24.getReportContext().id;
  for(const school of db.schools)for(const c of school.classes)for(const l of c.lessons)if(l.gradeMode==="kardanesh")for(const st of c.students)l.kardaneshScores[st.id]={practical:18,theory:12,midtermPractical:18,midtermTheory:12};
  await saveDB();
  const pair={first:firstId,second:secondId};
  let wrongPair=false;try{await EduV24.prepareReportSnapshot({annual:true,periodIds:{first:firstId,second:firstId}});}catch{wrongPair=true;}
  record("P15","annual report refuses the same period in both roles",wrongPair);
  let swapped=false;try{await EduV24.prepareReportSnapshot({annual:true,periodIds:{first:secondId,second:firstId}});}catch{swapped=true;}
  record("P16","known first/second roles cannot be swapped by a dropdown",swapped);
  const otherYear=(await EduV24.snapshotInstallation()).stores.catalog.find(row=>row.year!==year);
  let crossYear=false;try{await EduV24.prepareReportSnapshot({annual:true,periodIds:{first:firstId,second:otherYear.id}});}catch{crossYear=true;}
  record("P17","annual pair cannot cross academic years",crossYear);
  state.view="reports";state.reportTab="annual";EduPeriodicReports.selectScope("school_a","class_a");render();await new Promise(resolve=>setTimeout(resolve,80));
  let select=document.getElementById("annualFirstPeriod");select.value=firstId;select.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,80));
  select=document.getElementById("annualSecondPeriod");select.value=secondId;select.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,80));
  const annual=await EduPeriodicReports.generate();
  record("P18","annual dropdowns generate a report from the selected actual pair",annual?.periods[0].id===firstId&&annual.periods[1].id===secondId&&annual.annualGrades.find(row=>row.studentId==="student_a").final===16.2);
  const annualNote="یادداشت جفت نوبت برای بازیابی";
  EduPeriodicReports.note(annualNote);
  await EduV24.switchPeriod(firstId);closeModal();state.schoolId="school_a";state.classId="class_a";state.lessonId="lesson_dual";
  showModal("Pending grade",buildLessonGradesHtml(db.schools[0].classes[0],db.schools[0].classes[0].lessons[0]));
  let input=[...document.querySelectorAll("[data-grade]")].find(node=>node.dataset.student==="student_a"&&node.dataset.field==="midtermPractical");input.value="99";input.dispatchEvent(new Event("input",{bubbles:true}));
  const pendingBackup=await EduV24.snapshotInstallation();EduV24.validateFullBackup(pendingBackup);
  record("P19","backup contains invalid draft separately from valid durable grade",pendingBackup.gradeDrafts.some(row=>row.workspace===firstId&&row.entries.some(item=>item.sid==="student_a"&&item.field==="midtermPractical"&&item.value==="99"))&&pendingBackup.stores.records.some(row=>row.workspace===firstId&&row.value?.lessons?.some(l=>l.kardaneshScores?.student_a?.midtermPractical===18)));
  record("P20","backup format declares schema 26",pendingBackup.schemaVersion===26);
  input.value="18";input.dispatchEvent(new Event("input",{bubbles:true}));await EduV24.flushDrafts({strict:true});closeModal();
  const ids=new Set([firstId,secondId]);for(const [name,rows]of Object.entries(pendingBackup.stores))pendingBackup.stores[name]=name==="catalog"?rows.filter(row=>ids.has(row.id)):rows.filter(row=>ids.has(row.workspace));
  pendingBackup.activeWorkspace=firstId;pendingBackup.gradeDrafts=pendingBackup.gradeDrafts.filter(row=>ids.has(row.workspace));pendingBackup.reportDrafts=Object.fromEntries(Object.entries(pendingBackup.reportDrafts).filter(([id])=>ids.has(id)));
  const priorIds=new Set((await readAll("catalog")).map(row=>row.id));
  EduV24.previewFullBackup(pendingBackup);await EduV24.restoreFullBackup();
  const newFirst=EduV24.getReportContext().id,newSecond=(await EduV24.listAnnualReportPeriods()).find(row=>!priorIds.has(row.id)&&row.termKind==="second").id;
  record("P21","restored invalid draft stays review-only and never becomes a grade",EduV24.test.getState().drafts.some(item=>item.value==="99"&&item.review)&&db.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical===18);
  const notes=EduPeriodicReports.getDrafts(newSecond);
  record("P22","annual note remaps both selected workspace references during restore",Object.entries(notes).some(([key,value])=>key.includes("academic-year:"+newFirst+":"+newSecond)&&value===annualNote));
  await EduV24.discardDrafts();await EduV24.switchPeriod(newSecond);
  state.view="reports";state.reportTab="annual";EduPeriodicReports.selectScope("school_a","class_a");render();EduPeriodicReports.set("annualFirstId",newFirst);EduPeriodicReports.set("annualSecondId",newSecond);await new Promise(resolve=>setTimeout(resolve,80));
  const restoredAnnual=await EduPeriodicReports.generate();
  record("P23","restored two-term report preserves average and pair-specific note",restoredAnnual?.annualGrades.find(row=>row.studentId==="student_a").final===16.2&&restoredAnnual.note===annualNote);
 }catch(error){record("P99","post-fix regression flow completed",false,{error:error.stack||error.message});}
 return cases;
}

if(process.argv.includes("--help")){
 console.log("node audit/workflow-review.cjs\nSynthetic browser regression and two-release PWA upgrade. Requires Node.js 22+, Edge and Git history containing 594217b. No user profile or application source changes. Exit 1: failed check; exit 2: harness error.");
 process.exit(0);
}
const runnerPath=path.join(__dirname,"data-integrity.cjs");
let runner=fs.readFileSync(runnerPath,"utf8").replace(/\r\n/g,"\n");
const marker='    const hash = crypto.createHash';
if(!runner.includes(marker))throw Error("Audit harness injection marker changed.");
const addition=[
'    await cdp("Page.reload"); await delay(500);',
'    for(let i=0;i<150;i++){if(await evaluate("!!window.EduV24?.test?.getState().ready"))break;await delay(100);}',
'    cases.push(...await evaluate("(" + seniorReviewFlows.toString() + ")()"));',
'    cases.push(...await evaluate("(" + postFixFlows.toString() + ")()"));',
'    await cdp("Emulation.setDeviceMetricsOverride",{width:320,height:800,deviceScaleFactor:1,mobile:false});',
'    cases.push(...await evaluate("(" + seniorUiReview.toString() + ")()"));',
'    cases.push(...await require("./pwa-upgrade.cjs")({cdp,debuggerUrl:ws.url,root}));',
].join("\n");
runner=runner.replace(marker,addition+"\n"+marker).replace('stage: "3-simple-workflow-mobile-and-four-assessments"','stage: "4-adversarial-workflow-review"');
runner=runner.replace('async function main() {',seniorReviewFlows.toString()+"\n"+seniorUiReview.toString()+"\n"+postFixFlows.toString()+"\nasync function main() {");
const isolated=new Module(runnerPath,module);
isolated.filename=runnerPath;
isolated.paths=module.paths;
isolated._compile(runner,runnerPath);
