import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());


const seed = {
  settings: {
    businessHours: "12:00～04:00",
    phone: "",
    line: ""
  },
  beauticians: []
};


async function getDB(env){

  if(!env.MUYU_KV){
    throw new Error("MUYU_KV 尚未設定");
  }

  const raw =
    await env.MUYU_KV.get("site");

  if(!raw){
    return {
      settings:{...seed.settings},
      beauticians:[]
    };
  }

  try{
    return JSON.parse(raw);
  }catch{
    return {
      settings:{...seed.settings},
      beauticians:[]
    };
  }
}


async function putDB(env,db){

  if(!env.MUYU_KV){
    throw new Error("MUYU_KV 尚未設定");
  }

  await env.MUYU_KV.put(
    "site",
    JSON.stringify(db)
  );
}


function okAuth(c){

  const expected =
    c.env.ADMIN_TOKEN || "";

  const got =
    c.req.header("Authorization") || "";

  return(
    expected &&
    got === `Bearer ${expected}`
  );
}


/* =========================
   取得網站資料
========================= */

app.get("/api/site", async c=>{

  try{

    return c.json(
      await getDB(c.env)
    );

  }catch(e){

    return c.json(
      {
        error:
          "資料讀取失敗：" +
          e.message
      },
      500
    );

  }

});


/* =========================
   登入
========================= */

app.post("/api/login", async c=>{

  const body =
    await c.req
      .json()
      .catch(()=>({}));


  if(
    !c.env.ADMIN_PASSWORD ||
    body.password !==
      c.env.ADMIN_PASSWORD
  ){

    return c.json(
      {
        error:"密碼錯誤"
      },
      401
    );

  }


  return c.json({
    token:
      c.env.ADMIN_TOKEN || ""
  });

});


/* =========================
   店家設定
========================= */

app.post("/api/settings", async c=>{

  if(!okAuth(c)){

    return c.json(
      {error:"未授權"},
      401
    );

  }


  try{

    const db =
      await getDB(c.env);

    const body =
      await c.req.json();


    db.settings = {
      ...db.settings,
      businessHours:
        body.businessHours ?? db.settings.businessHours,
      phone:
        body.phone ?? db.settings.phone,
      line:
        body.line ?? db.settings.line
    };


    await putDB(
      c.env,
      db
    );


    /* 直接回傳成功結果 */

    return c.json({
      ok:true,
      settings:
        db.settings
    });

  }catch(e){

    return c.json(
      {
        error:
          "店家設定儲存失敗：" +
          e.message
      },
      500
    );

  }

});


/* =========================
   批次新增照片
========================= */

app.post(
  "/api/beauticians/batch",
  async c=>{

    if(!okAuth(c)){

      return c.json(
        {error:"未授權"},
        401
      );

    }


    try{

      const body =
        await c.req.json();


      const photos =
        Array.isArray(body.photos)
          ? body.photos
          : [];


      if(!photos.length){

        return c.json(
          {
            error:
              "沒有照片"
          },
          400
        );

      }


      if(photos.length > 8){

        return c.json(
          {
            error:
              "一次最多 8 張照片"
          },
          400
        );

      }


      const db =
        await getDB(c.env);


      const today =
        new Date()
          .toISOString()
          .slice(0,10);


      const items =
        photos.map(
          photo => ({

            id:
              crypto.randomUUID(),

            name:
              "美容師",

            nationality:
              "",

            time:
              "",

            intro:
              "",

            today:
              true,

            uploadDate:
              today,

            photo:
              photo

          })
        );


      db.beauticians =
        [
          ...items,
          ...(db.beauticians || [])
        ];


      await putDB(
        c.env,
        db
      );


      return c.json({
        ok:true,
        count:
          items.length
      });

    }catch(e){

      return c.json(
        {
          error:
            "批次照片儲存失敗：" +
            e.message
        },
        500
      );

    }

  }
);


/* =========================
   一鍵清除今日
========================= */

app.delete(
  "/api/beauticians/today",
  async c=>{

    if(!okAuth(c)){

      return c.json(
        {error:"未授權"},
        401
      );

    }


    try{

      const db =
        await getDB(c.env);


      const today =
        new Date()
          .toISOString()
          .slice(0,10);


      const before =
        db.beauticians.length;


      db.beauticians =
        db.beauticians.filter(
          x =>
            !(
              x.today &&
              x.uploadDate === today
            )
        );


      const removed =
        before -
        db.beauticians.length;


      await putDB(
        c.env,
        db
      );


      return c.json({
        ok:true,
        count:removed
      });

    }catch(e){

      return c.json(
        {
          error:
            "清除今日報班失敗：" +
            e.message
        },
        500
      );

    }

  }
);


/* =========================
   單張刪除
========================= */

app.delete(
  "/api/beauticians/:id",
  async c=>{

    if(!okAuth(c)){

      return c.json(
        {error:"未授權"},
        401
      );

    }


    try{

      const db =
        await getDB(c.env);

      const id =
        c.req.param("id");


      db.beauticians =
        db.beauticians.filter(
          x => x.id !== id
        );


      await putDB(
        c.env,
        db
      );


      return c.json({
        ok:true
      });

    }catch(e){

      return c.json(
        {
          error:
            "刪除失敗：" +
            e.message
        },
        500
      );

    }

  }
);


/* =========================
   保留舊單張新增 API
========================= */

app.post(
  "/api/beauticians",
  async c=>{

    if(!okAuth(c)){

      return c.json(
        {error:"未授權"},
        401
      );

    }


    try{

      const body =
        await c.req.json();

      const db =
        await getDB(c.env);


      const today =
        new Date()
          .toISOString()
          .slice(0,10);


      const item = {

        id:
          crypto.randomUUID(),

        name:
          "美容師",

        nationality:
          "",

        time:
          "",

        intro:
          "",

        today:
          body.today !== false,

        uploadDate:
          today,

        photo:
          body.photo || ""

      };


      db.beauticians.unshift(
        item
      );


      await putDB(
        c.env,
        db
      );


      return c.json({
        ok:true,
        item
      });

    }catch(e){

      return c.json(
        {
          error:
            "新增失敗：" +
            e.message
        },
        500
      );

    }

  }
);


/* =========================
   修改
========================= */

app.put(
  "/api/beauticians/:id",
  async c=>{

    if(!okAuth(c)){

      return c.json(
        {error:"未授權"},
        401
      );

    }


    try{

      const db =
        await getDB(c.env);

      const id =
        c.req.param("id");


      const index =
        db.beauticians.findIndex(
          x => x.id === id
        );


      if(index < 0){

        return c.json(
          {
            error:
              "找不到資料"
          },
          404
        );

      }


      const body =
        await c.req.json();


      db.beauticians[index] = {
        ...db.beauticians[index],
        ...body
      };


      await putDB(
        c.env,
        db
      );


      return c.json({
        ok:true,
        item:
          db.beauticians[index]
      });

    }catch(e){

      return c.json(
        {
          error:
            "更新失敗：" +
            e.message
        },
        500
      );

    }

  }
);


/* =========================
   前台
========================= */

app.all("*", async c=>{

  const asset =
    await c.env.ASSETS.fetch(
      c.req.raw
    );

  return asset;

});


export default app;
