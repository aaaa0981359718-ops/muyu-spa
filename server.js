const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const DATA = path.join(__dirname, "data.json");
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, JSON.stringify({
    settings: { businessHours: "12:00～04:00", phone: "", line: "" },
    beauticians: []
  }, null, 2));
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ["image/jpeg","image/png","image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("只接受 JPG、PNG、WEBP 圖片"), ok);
  }
});

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

function readDB(){ return JSON.parse(fs.readFileSync(DATA,"utf8")); }
function writeDB(db){ fs.writeFileSync(DATA, JSON.stringify(db,null,2)); }
function auth(req,res,next){
  if(req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN || ""}`){
    return res.status(401).json({error:"未授權"});
  }
  next();
}
function tokenFor(password){ return crypto.createHash("sha256").update(password).digest("hex"); }

app.post("/api/login",(req,res)=>{
  if(!req.body || req.body.password !== ADMIN_PASSWORD) return res.status(401).json({error:"密碼錯誤"});
  res.json({token: tokenFor(ADMIN_PASSWORD)});
});
app.get("/api/site",(req,res)=>res.json(readDB()));
app.post("/api/settings",auth,(req,res)=>{
  const db=readDB();
  db.settings={...db.settings,...req.body};
  writeDB(db); res.json(db.settings);
});
app.post("/api/beauticians",auth,upload.single("photo"),(req,res)=>{
  const db=readDB();
  const item={
    id: crypto.randomUUID(),
    no:req.body.no||"",
    nationality:req.body.nationality||"",
    name:req.body.name||"美容師",
    time:req.body.time||"",
    intro:req.body.intro||"",
    today:req.body.today !== "false",
    photo:req.file ? `/uploads/${req.file.filename}` : ""
  };
  db.beauticians.unshift(item); writeDB(db); res.json(item);
});
app.put("/api/beauticians/:id",auth,upload.single("photo"),(req,res)=>{
  const db=readDB(); const i=db.beauticians.findIndex(x=>x.id===req.params.id);
  if(i<0) return res.status(404).json({error:"找不到資料"});
  const old=db.beauticians[i];
  const next={...old,...req.body,today:req.body.today !== "false"};
  if(req.file){
    if(old.photo) { const f=path.join(__dirname,old.photo.replace(/^\/uploads\//,"uploads/")); if(fs.existsSync(f)) fs.unlinkSync(f); }
    next.photo=`/uploads/${req.file.filename}`;
  }
  db.beauticians[i]=next; writeDB(db); res.json(next);
});
app.delete("/api/beauticians/:id",auth,(req,res)=>{
  const db=readDB(); const i=db.beauticians.findIndex(x=>x.id===req.params.id);
  if(i<0) return res.status(404).json({error:"找不到資料"});
  const old=db.beauticians[i];
  if(old.photo){const f=path.join(__dirname,old.photo.replace(/^\/uploads\//,"uploads/")); if(fs.existsSync(f)) fs.unlinkSync(f);}
  db.beauticians.splice(i,1); writeDB(db); res.json({ok:true});
});

app.use((err,req,res,next)=>res.status(400).json({error:err.message||"發生錯誤"}));
app.listen(PORT,()=>console.log(`莯浴 SPA running on http://localhost:${PORT}`));
