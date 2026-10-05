const initialMacros = []; // Cloud database is the source of truth.
let macros = [];
let supabaseClient = null;
let realtimeChannel = null;

const $ = id => document.getElementById(id);
const form = $("macroForm"), search = $("search");

function escapeHtml(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function normalize(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function toast(msg){
  const t=$("toast");
  t.textContent=msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1800);
}
function setSyncStatus(text, state=""){
  const el=$("syncStatus");
  el.textContent=text;
  el.className="sync-status "+state;
}
function showLoginError(msg){
  $("loginError").textContent=msg;
  $("loginError").classList.remove("hidden");
}
function clearLoginError(){
  $("loginError").textContent="";
  $("loginError").classList.add("hidden");
}
function showApp(user){
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userEmail").textContent=user?.email || "";
}
function showLogin(){
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}
function configReady(){
  const c=window.MACRODESK_CONFIG || {};
  return c.supabaseUrl && c.supabasePublishableKey &&
    !c.supabaseUrl.includes("PASTE_YOUR_") &&
    !c.supabasePublishableKey.includes("PASTE_YOUR_");
}
async function initSupabase(){
  if(!configReady()){
    showLoginError("Supabase is not configured yet. Add your Project URL and publishable key to config.js, then redeploy.");
    setSyncStatus("Not configured","error");
    return false;
  }
  const {createClient}=window.supabase;
  const c=window.MACRODESK_CONFIG;
  supabaseClient=createClient(c.supabaseUrl,c.supabasePublishableKey);
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session?.user){
    showApp(session.user);
    await loadMacros();
    subscribeToChanges();
  }else{
    showLogin();
  }
  supabaseClient.auth.onAuthStateChange(async (_event, session)=>{
    if(session?.user){
      showApp(session.user);
      await loadMacros();
      subscribeToChanges();
    }else{
      macros=[];
      if(realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
      showLogin();
    }
  });
  return true;
}

async function loadMacros(){
  setSyncStatus("Syncing…");
  const {data,error}=await supabaseClient.from("macros").select("*").order("title",{ascending:true});
  if(error){
    console.error(error);
    setSyncStatus("Sync error","error");
    toast("Could not load shared macros");
    return;
  }
  macros=data||[];
  render();
  setSyncStatus("Cloud synced","ok");
}
function subscribeToChanges(){
  if(realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel=supabaseClient
    .channel("macrodesk-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"macros"},async()=>{ await loadMacros(); })
    .subscribe();
}

function renderCategories(){
  const current=$("categoryFilter").value;
  const cats=[...new Set(macros.map(m=>m.category).filter(Boolean))].sort();
  $("categoryFilter").innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
  if(cats.includes(current)) $("categoryFilter").value=current;
}
function scoreMacro(m,q){
  if(!q)return 1;
  const terms=normalize(q).split(/\s+/).filter(Boolean);
  const title=normalize(m.title), situation=normalize(m.situation), body=normalize(m.macro);
  const keys=normalize((m.keywords||[]).join(" ")), cat=normalize(m.category);
  return terms.reduce((score,t)=>{
    if(title.includes(t))score+=10;
    if(keys.includes(t))score+=8;
    if(cat.includes(t))score+=5;
    if(situation.includes(t))score+=4;
    if(body.includes(t))score+=2;
    return score;
  },0);
}
function getMatches(){
  const q=search.value.trim(), cat=$("categoryFilter").value;
  return macros.map(m=>({...m,_score:scoreMacro(m,q)}))
    .filter(m=>(!q||m._score>0)&&(!cat||m.category===cat))
    .sort((a,b)=>b._score-a._score||a.title.localeCompare(b.title));
}
function renderResults(){
  const matches=getMatches();
  $("resultCount").textContent=`${matches.length} found`;
  $("results").innerHTML=matches.map(m=>`
    <article class="macro-card">
      <div class="macro-top"><div class="macro-title">${escapeHtml(m.title)}</div>${m.category?`<span class="tag">${escapeHtml(m.category)}</span>`:""}</div>
      ${m.situation?`<div class="situation">${escapeHtml(m.situation)}</div>`:""}
      <div class="response-label">READY-TO-SEND RESPONSE</div>
      <div class="macro-text">${escapeHtml(m.macro)}</div>
      <div class="card-actions"><button class="copy" onclick="copyMacro(${m.id})">Copy response</button><button onclick="editMacro(${m.id})">Edit</button></div>
    </article>`).join("");
  $("emptyState").classList.toggle("hidden",matches.length!==0);
}
function renderManage(){
  $("macroCount").textContent=macros.length;
  $("manageList").innerHTML=macros.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(m=>`
    <div class="manage-item"><div class="manage-item-title">${escapeHtml(m.title)}</div>
    <div class="manage-meta">${escapeHtml(m.category||"Uncategorized")}</div>
    <div class="item-actions"><button class="edit" onclick="editMacro(${m.id})">Edit / Update</button><button class="delete" onclick="deleteMacro(${m.id})">Delete</button></div></div>`).join("");
}
function renderSideCategories(){
  const cats=[...new Set(macros.map(m=>m.category).filter(Boolean))].sort();
  $("sideCategories").innerHTML=cats.map(c=>`<button class="side-cat" onclick="search.value='';$('categoryFilter').value=${JSON.stringify(c)};document.querySelector('[data-view="searchView"]').click();renderResults()">› ${escapeHtml(c)}</button>`).join("");
}
function render(){renderCategories();renderResults();renderManage();renderSideCategories();}

function clearForm(){
  form.reset();
  $("macroId").value="";
  $("formTitle").textContent="Add New Macro";
  $("saveBtn").textContent="Save Macro";
}
function editMacro(id){
  const m=macros.find(x=>String(x.id)===String(id));
  if(!m)return;
  $("macroId").value=m.id;
  $("title").value=m.title;
  $("category").value=m.category||"";
  $("situation").value=m.situation||"";
  $("macro").value=m.macro||"";
  $("keywords").value=(m.keywords||[]).join(", ");
  $("formTitle").textContent="Update Macro";
  $("saveBtn").textContent="Update Macro";
  document.querySelector('[data-view="manageView"]').click();
  window.scrollTo({top:0,behavior:"smooth"});
  $("title").focus();
}
async function deleteMacro(id){
  const m=macros.find(x=>String(x.id)===String(id));
  if(!m)return;
  if(!confirm(`Delete "${m.title}" from the shared library?`))return;
  setSyncStatus("Deleting…");
  const {error}=await supabaseClient.from("macros").delete().eq("id",id);
  if(error){console.error(error);setSyncStatus("Sync error","error");toast("Delete failed");return;}
  await loadMacros();
  toast("Macro deleted for all agents");
}
async function copyMacro(id){
  const m=macros.find(x=>String(x.id)===String(id));
  if(!m)return;
  try{
    await navigator.clipboard.writeText(m.macro);
    toast("Macro copied to clipboard");
  }catch(e){
    const ta=document.createElement("textarea");
    ta.value=m.macro;document.body.appendChild(ta);ta.select();
    document.execCommand("copy");ta.remove();toast("Macro copied");
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("macroId").value;
  const data={
    title:$("title").value.trim(),
    category:$("category").value.trim(),
    situation:$("situation").value.trim(),
    macro:$("macro").value.trim(),
    keywords:$("keywords").value.split(",").map(x=>x.trim()).filter(Boolean)
  };
  if(!data.title||!data.macro)return;

  setSyncStatus("Saving…");
  let result;
  if(id){
    result=await supabaseClient.from("macros").update(data).eq("id",id);
  }else{
    result=await supabaseClient.from("macros").insert(data);
  }
  if(result.error){
    console.error(result.error);
    setSyncStatus("Sync error","error");
    toast("Could not save macro");
    return;
  }
  clearForm();
  await loadMacros();
  toast(id ? "Macro updated for all agents" : "Macro added for all agents");
});

$("cancelBtn").onclick=clearForm;
$("newBtn").onclick=()=>{clearForm();$("title").focus()};
$("newTopBtn").onclick=()=>{
  document.querySelector('[data-view="manageView"]').click();
  clearForm();$("title").focus();
};

search.addEventListener("input",renderResults);
search.addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();renderResults();}
  if(e.key==="Escape"){search.value="";renderResults();}
});
$("clearSearch").onclick=()=>{search.value="";renderResults();search.focus()};
$("categoryFilter").onchange=renderResults;

$("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(macros,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="courier-support-macros.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Shared macros exported");
};

$("importFile").onchange=async e=>{
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async ()=>{
    try{
      const imported=JSON.parse(reader.result);
      if(!Array.isArray(imported))throw new Error("Not an array");
      const clean=imported.map(m=>({
        ...(m.id ? {id:m.id} : {}),
        title:String(m.title||"").trim(),
        category:String(m.category||"").trim(),
        situation:String(m.situation||"").trim(),
        macro:String(m.macro||"").trim(),
        keywords:Array.isArray(m.keywords)?m.keywords.map(String):[]
      })).filter(m=>m.title&&m.macro);
      if(!clean.length)throw new Error("No valid macros");
      setSyncStatus("Importing…");
      const {error}=await supabaseClient.from("macros").upsert(clean,{onConflict:"id"});
      if(error)throw error;
      await loadMacros();
      toast(`${clean.length} macros imported to shared library`);
    }catch(err){
      console.error(err);
      alert("Import failed. Please use a valid MacroDesk JSON export.");
    }
    e.target.value="";
  };
  reader.readAsText(file);
};

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  clearLoginError();
  if(!supabaseClient){
    showLoginError("Supabase is not configured. Update config.js first.");
    return;
  }
  const email=$("loginEmail").value.trim();
  const password=$("loginPassword").value;
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)showLoginError(error.message);
});
$("logoutBtn").onclick=async()=>{
  await supabaseClient.auth.signOut();
  toast("Signed out");
};

document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active-view"));
  $(btn.dataset.view).classList.add("active-view");
  $("pageTitle").textContent=btn.dataset.view==="manageView"?"Manage Macros":"Macro Search";
}));
document.querySelectorAll(".quick-row button").forEach(b=>b.onclick=()=>{
  search.value=b.dataset.query;
  document.querySelector('[data-view="searchView"]').click();
  renderResults();
});

initSupabase();
