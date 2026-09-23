let scanner = null;
let scannerRunning = false;
let photoDataUrl = null;

const $ = id => document.getElementById(id);

function showToast(msg){
  const el=$("toast"); el.textContent=msg; el.style.display="block";
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.style.display="none",3000);
}

function api(payload){
  return fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(payload)
  }).then(r=>r.json());
}

function localClock(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat("id-ID",{timeZone:APP_CONFIG.timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(now);
  const get=t=>parts.find(x=>x.type===t)?.value||"";
  $("clock").textContent=`${get("hour")}:${get("minute")}:${get("second")}`;
  $("dateText").textContent=new Intl.DateTimeFormat("id-ID",{timeZone:APP_CONFIG.timezone,weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(now);
}
setInterval(localClock,1000); localClock();

async function loadDashboard(){
  try{
    const res=await api({action:"dashboard"});
    if(!res.ok) throw new Error(res.message||"Backend error");
    $("connectionBadge").textContent="TERHUBUNG";
    $("totalGuru").textContent=res.data.totalGuru;
    $("hadir").textContent=res.data.hadir;
    $("alpa").textContent=res.data.alpa;
    $("belum").textContent=res.data.belum;
    const s=$("statusApel");
    s.className="status "+(res.data.statusOpen?"open":"closed");
    s.textContent=res.data.statusOpen?"🟢 ABSENSI APEL DIBUKA":"🔴 ABSENSI APEL DITUTUP";
  }catch(e){
    $("connectionBadge").textContent="OFFLINE";
    $("statusApel").className="status closed";
    $("statusApel").textContent="⚠ SERVER BELUM TERHUBUNG";
  }
}
loadDashboard(); setInterval(loadDashboard,15000);

async function submitAttendance(identifier,method){
  identifier=(identifier||"").trim();
  if(!identifier){showToast("Masukkan ID Guru atau NIP");return;}
  try{
    const res=await api({action:"attendance",identifier,method});
    const box=$("scanResult"); box.classList.remove("hidden");
    if(res.ok){
      box.className="result ok";
      box.innerHTML=`✓ ABSENSI BERHASIL<br><small>${res.data.nama} • ${res.data.jam} • ${res.data.status}</small>`;
      $("manualId").value="";
      showToast("Absensi berhasil");
      loadDashboard();
    }else{
      box.className="result err";
      box.innerHTML=`❌ ${res.message}`;
    }
  }catch(e){
    showToast("Tidak dapat menghubungi server");
  }
}

$("manualBtn").onclick=()=>submitAttendance($("manualId").value,"MANUAL");
$("manualId").addEventListener("keydown",e=>{if(e.key==="Enter")$("manualBtn").click()});

$("startBtn").onclick=async()=>{
  if(scannerRunning)return;
  try{
    scanner=new Html5Qrcode("reader");
    await scanner.start(
      {facingMode:"environment"},
      {fps:10,qrbox:{width:250,height:250}},
      decodedText=>{
        if(scannerRunning){
          scannerRunning=false;
          scanner.stop().catch(()=>{});
          $("startBtn").disabled=false;$("stopBtn").disabled=true;
          submitAttendance(decodedText,"QR");
        }
      },
      ()=>{}
    );
    scannerRunning=true;$("startBtn").disabled=true;$("stopBtn").disabled=false;
  }catch(e){
    showToast("Kamera tidak dapat dibuka. Periksa izin kamera dan HTTPS.");
  }
};
$("stopBtn").onclick=async()=>{
  if(scanner){
    try{await scanner.stop();}catch(e){}
  }
  scannerRunning=false;$("startBtn").disabled=false;$("stopBtn").disabled=true;
};

$("photoBtn").onclick=()=>$("photoInput").click();
$("photoInput").onchange=e=>{
  const file=e.target.files?.[0]; if(!file)return;
  const img=new Image();
  img.onload=()=>{
    const canvas=$("photoCanvas"), maxW=1600, scale=Math.min(1,maxW/img.width);
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const now=new Date();
    const date=new Intl.DateTimeFormat("id-ID",{timeZone:APP_CONFIG.timezone,dateStyle:"full"}).format(now);
    const time=new Intl.DateTimeFormat("id-ID",{timeZone:APP_CONFIG.timezone,timeStyle:"medium"}).format(now);
    const stamp=`${APP_CONFIG.schoolName}  |  APEL GURU  |  ${date}  ${time} WITA`;
    ctx.fillStyle="rgba(0,0,0,.68)";ctx.fillRect(0,canvas.height-62,canvas.width,62);
    ctx.fillStyle="#fff";ctx.font=`bold ${Math.max(18,Math.round(canvas.width/55))}px Arial`;
    ctx.fillText(stamp,20,canvas.height-23);
    photoDataUrl=canvas.toDataURL("image/jpeg",.88);
    $("photoPreview").innerHTML=`<img src="${photoDataUrl}" alt="Foto apel bertimestamp">`;
    $("uploadPhotoBtn").classList.remove("hidden");
    showToast("Foto siap disimpan");
  };
  img.src=URL.createObjectURL(file);
};

$("uploadPhotoBtn").onclick=async()=>{
  if(!photoDataUrl)return;
  $("uploadPhotoBtn").disabled=true;
  try{
    const res=await api({action:"uploadPhoto",dataUrl:photoDataUrl});
    if(res.ok){showToast("Foto apel berhasil disimpan");}
    else showToast(res.message||"Gagal menyimpan foto");
  }catch(e){showToast("Gagal mengirim foto");}
  finally{$("uploadPhotoBtn").disabled=false;}
};

document.querySelectorAll("[data-report]").forEach(btn=>{
  btn.onclick=async()=>{
    const jenis=btn.dataset.report;
    $("reportArea").innerHTML="<p class='muted'>Memuat laporan...</p>";
    try{
      const res=await api({action:"report",jenis});
      if(!res.ok) throw new Error(res.message);
      renderReport(res.data,jenis);
    }catch(e){$("reportArea").innerHTML=`<div class="result err">${e.message||"Gagal memuat laporan"}</div>`}
  };
});

function renderReport(data,jenis){
  let html=`<h3>${data.title}</h3>`;
  if(data.rows?.length){
    html+=`<div style="overflow:auto"><table class="report-table"><thead><tr>${data.headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>`;
    html+=data.rows.map(row=>`<tr>${row.map(v=>`<td>${v??""}</td>`).join("")}</tr>`).join("");
    html+="</tbody></table></div>";
    html+=`<button class="btn outline" style="margin-top:12px" onclick="printReport()">🖨 CETAK LAPORAN</button>`;
  }else html+="<p class='muted'>Belum ada data.</p>";
  $("reportArea").innerHTML=html;
  window.__printHtml=html;
}
function printReport(){
  const w=window.open("","_blank");
  w.document.write(`<html><head><title>Laporan Apel Guru</title><style>body{font-family:Arial;padding:25px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:7px;text-align:left}h3{text-align:center}</style></head><body>${window.__printHtml||""}</body></html>`);
  w.document.close();w.focus();w.print();
}
