import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("*", cors());

const seed = {
  settings: { businessHours: "12:00～04:00", phone: "", line: "" },
  beauticians: []
};

async function getDB(env) {
  const raw = await env.MUYU_KV.get("site");
  return raw ? JSON.parse(raw) : seed;
}
async function putDB(env, db) {
  await env.MUYU_KV.put("site", JSON.stringify(db));
}
function okAuth(c) {
  const expected = envToken(c.env);
  const got = c.req.header("Authorization") || "";
  return expected && got === `Bearer ${expected}`;
}
function envToken(env) {
  return env.ADMIN_TOKEN || "";
}

app.get("/api/site", async c => c.json(await getDB(c.env)));

app.post("/api/login", async c => {
  const body = await c.req.json().catch(()=>({}));
  if (!c.env.ADMIN_PASSWORD || body.password !== c.env.ADMIN_PASSWORD)
    return c.json({error:"密碼錯誤"},401);
  return c.json({token:c.env.ADMIN_TOKEN});
});

app.post("/api/settings", async c => {
  if (!okAuth(c)) return c.json({error:"未授權"},401);
  const db=await getDB(c.env), body=await c.req.json();
  db.settings={...db.settings,...body}; await putDB(c.env,db); return c.json(db.settings);
});

app.post("/api/beauticians", async c => {
  if (!okAuth(c)) return c.json({error:"未授權"},401);
  const body=await c.req.json();
  const db=await getDB(c.env);
  const item={id:crypto.randomUUID(),no:body.no||"",name:body.name||"美容師",nationality:body.nationality||"",time:body.time||"",intro:body.intro||"",today:body.today!==false,photo:body.photo||""};
  db.beauticians.unshift(item); await putDB(c.env,db); return c.json(item);
});

app.put("/api/beauticians/:id", async c => {
  if (!okAuth(c)) return c.json({error:"未授權"},401);
  const db=await getDB(c.env), i=db.beauticians.findIndex(x=>x.id===c.req.param("id"));
  if(i<0) return c.json({error:"找不到資料"},404);
  db.beauticians[i]={...db.beauticians[i],...(await c.req.json())};
  await putDB(c.env,db); return c.json(db.beauticians[i]);
});

app.delete("/api/beauticians/:id", async c => {
  if (!okAuth(c)) return c.json({error:"未授權"},401);
  const db=await getDB(c.env); db.beauticians=db.beauticians.filter(x=>x.id!==c.req.param("id"));
  await putDB(c.env,db); return c.json({ok:true});
});

app.get("/*", async c => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  return asset;
});
export default app;
