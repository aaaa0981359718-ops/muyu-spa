const KEY = "site";

const DEFAULT_DB = {
  settings: {
    businessHours: "12：00～04：00",
    phone: "",
    line: ""
  },
  beauticians: []
};


/* =========================
   讀取資料
========================= */

async function getDB(env) {

  if (!env.MUYU_KV) {
    throw new Error("MUYU_KV 尚未設定");
  }

  const raw = await env.MUYU_KV.get(KEY);

  if (!raw) {

    const db = structuredClone(DEFAULT_DB);

    await env.MUYU_KV.put(
      KEY,
      JSON.stringify(db)
    );

    return db;
  }

  const db = JSON.parse(raw);

  db.settings = {
    ...DEFAULT_DB.settings,
    ...(db.settings || {})
  };

  db.beauticians =
    Array.isArray(db.beauticians)
      ? db.beauticians
      : [];

  return db;
}


/* =========================
   儲存資料
========================= */

async function putDB(env, db) {

  await env.MUYU_KV.put(
    KEY,
    JSON.stringify(db)
  );

}


/* =========================
   JSON 回應
========================= */

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json;charset=UTF-8",

        "cache-control":
          "no-store"
      }
    }
  );

}


/* =========================
   管理員登入驗證
========================= */

async function checkAuth(request, env) {

  const token =
    request.headers.get("Authorization") || "";

  return token ===
    `Bearer ${env.ADMIN_TOKEN}`;
}


/* =========================
   清除目前所有報班照片
========================= */

async function clearPhotos(env) {

  const db = await getDB(env);

  const removed =
    db.beauticians.length;

  /*
    這裡直接清空所有目前照片。

    不再使用：
    today
    上班狀態
    日期判斷
  */

  db.beauticians = [];

  await putDB(env, db);

  return removed;
}


/* =========================
   Worker
========================= */

export default {

  /* =========================
     Cloudflare Cron
  ========================= */

  async scheduled(event, env, ctx) {

    /*
      Cron 每小時執行一次。

      台灣時間：
      04:00 = UTC 20:00

      所以只有 UTC 20:00 執行清除。

      00:00 完全不處理。
    */

    const now = new Date();

    const utcHour =
      now.getUTCHours();

    if (utcHour !== 20) {
      return;
    }

    try {

      const removed =
        await clearPhotos(env);

      console.log(
        `04:00 自動清除完成，共刪除 ${removed} 張照片`
      );

    } catch (error) {

      console.error(
        "04:00 自動清除失敗",
        error
      );

    }

  },


  /* =========================
     網站 API
  ========================= */

  async fetch(request, env) {

    const url =
      new URL(request.url);

    const path =
      url.pathname;

    const method =
      request.method;


    try {


      /* =========================
         管理員登入
      ========================= */

      if (
        path === "/api/login" &&
        method === "POST"
      ) {

        const body =
          await request.json();

        if (
          body.password !==
          env.ADMIN_PASSWORD
        ) {

          return json(
            {
              ok: false,
              message: "密碼錯誤"
            },
            401
          );

        }

        return json({
          ok: true,
          token: env.ADMIN_TOKEN
        });

      }


      /* =========================
         公開網站資料
      ========================= */

      if (
        path === "/api/site" &&
        method === "GET"
      ) {

        const db =
          await getDB(env);

        return json(db);

      }


      /* =========================
         以下 API 都需要登入
      ========================= */

      if (
        path.startsWith("/api/") &&
        !(await checkAuth(request, env))
      ) {

        return json(
          {
            ok: false,
            message: "未授權"
          },
          401
        );

      }


      /* =========================
         儲存店家設定
      ========================= */

      if (
        path === "/api/settings" &&
        method === "PUT"
      ) {

        const body =
          await request.json();

        const db =
          await getDB(env);

        db.settings = {

          ...db.settings,

          businessHours:
            body.businessHours ||
            "12：00～04：00",

          phone:
            body.phone || "",

          line:
            body.line || ""

        };

        await putDB(env, db);

        return json({
          ok: true,
          settings: db.settings
        });

      }


      /* =========================
         批次上傳照片
      ========================= */

      if (
        path === "/api/beauticians/batch" &&
        method === "POST"
      ) {

        const body =
          await request.json();

        const photos =
          Array.isArray(body.photos)
            ? body.photos
            : [];

        if (!photos.length) {

          return json(
            {
              ok: false,
              message: "沒有收到照片"
            },
            400
          );

        }


        if (photos.length > 8) {

          return json(
            {
              ok: false,
              message:
                "一次最多上傳 8 張照片"
            },
            400
          );

        }


        const db =
          await getDB(env);


        /*
          上傳的照片直接成為
          今日報班照片。
        */

        const newItems =
          photos.map((photo, index) => ({

            id:
              crypto.randomUUID(),

            name:
              `美容師${db.beauticians.length + index + 1}`,

            no: "",

            nationality: "",

            time: "",

            intro: "",

            photo: photo

          }));


        db.beauticians.push(
          ...newItems
        );


        await putDB(env, db);


        return json({
          ok: true,
          added: newItems.length
        });

      }


      /* =========================
         舊版單張新增 API
         保留相容性
      ========================= */

      if (
        path === "/api/beauticians" &&
        method === "POST"
      ) {

        const body =
          await request.json();

        const db =
          await getDB(env);


        const item = {

          id:
            crypto.randomUUID(),

          no:
            body.no || "",

          name:
            body.name ||
            `美容師${db.beauticians.length + 1}`,

          nationality:
            body.nationality || "",

          time:
            body.time || "",

          intro:
            body.intro || "",

          photo:
            body.photo || ""

        };


        db.beauticians.push(item);

        await putDB(env, db);


        return json({
          ok: true,
          item
        });

      }


      /* =========================
         修改指定照片資料
         保留相容性
      ========================= */

      const itemMatch =
        path.match(
          /^\/api\/beauticians\/([^/]+)$/
        );


      if (
        itemMatch &&
        method === "PUT"
      ) {

        const id =
          itemMatch[1];

        const body =
          await request.json();

        const db =
          await getDB(env);

        const item =
          db.beauticians.find(
            x => x.id === id
          );


        if (!item) {

          return json(
            {
              ok: false,
              message: "找不到照片"
            },
            404
          );

        }


        /*
          不處理 today。
          新版本沒有上班狀態。
        */

        if (
          body.photo !== undefined
        ) {
          item.photo =
            body.photo;
        }

        if (
          body.name !== undefined
        ) {
          item.name =
            body.name;
        }

        if (
          body.no !== undefined
        ) {
          item.no =
            body.no;
        }

        if (
          body.nationality !== undefined
        ) {
          item.nationality =
            body.nationality;
        }

        if (
          body.time !== undefined
        ) {
          item.time =
            body.time;
        }

        if (
          body.intro !== undefined
        ) {
          item.intro =
            body.intro;
        }


        await putDB(env, db);


        return json({
          ok: true,
          item
        });

      }


      /* =========================
         永久刪除指定照片
      ========================= */

      if (
        itemMatch &&
        method === "DELETE"
      ) {

        const id =
          itemMatch[1];

        const db =
          await getDB(env);

        const before =
          db.beauticians.length;


        db.beauticians =
          db.beauticians.filter(
            x => x.id !== id
          );


        if (
          db.beauticians.length ===
          before
        ) {

          return json(
            {
              ok: false,
              message: "找不到照片"
            },
            404
          );

        }


        await putDB(env, db);


        return json({
          ok: true
        });

      }


      /* =========================
         一鍵清除目前報班
      ========================= */

      if (
        path === "/api/beauticians/today" &&
        method === "DELETE"
      ) {

        const removed =
          await clearPhotos(env);


        return json({
          ok: true,
          removed: removed
        });

      }


      /* =========================
         網站檔案
      ========================= */

      if (env.ASSETS) {

        return env.ASSETS.fetch(
          request
        );

      }


      return new Response(
        "Not Found",
        {
          status: 404
        }
      );


    } catch (error) {

      console.error(error);


      return json(
        {
          ok: false,
          message:
            error.message ||
            "伺服器錯誤"
        },
        500
      );

    }

  }

};
