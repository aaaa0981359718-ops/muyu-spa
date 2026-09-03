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

  /*
    只保留真正有照片的資料
    沒有照片的資料直接忽略
  */
  db.beauticians = Array.isArray(db.beauticians)
    ? db.beauticians.filter(x => x && x.photo)
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
   JSON
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
   管理員驗證
========================= */

async function checkAuth(request, env) {

  const token =
    request.headers.get("Authorization") || "";

  return token ===
    `Bearer ${env.ADMIN_TOKEN}`;
}


/* =========================
   完全清除照片
========================= */

async function clearAllPhotos(env) {

  const db = await getDB(env);

  const removed =
    db.beauticians.length;

  /*
    最重要的地方：

    直接把照片陣列清空。

    清除後：
    網站沒有照片
    後台沒有照片
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
     凌晨 04:00 自動清除
  ========================= */

  async scheduled(event, env, ctx) {

    /*
      wrangler.toml：

      crons = ["0 * * * *"]

      每小時檢查一次。

      台灣時間 04:00
      = UTC 20:00

      只有 UTC 20:00 才清除。

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
        await clearAllPhotos(env);

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
     HTTP
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
         登入
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
         其他 API 必須登入
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
         店家設定
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
         一次上傳最多 8 張
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

        const newItems =
          photos
            .filter(photo =>
              typeof photo === "string" &&
              photo.length > 0
            )
            .map(photo => ({

              id:
                crypto.randomUUID(),

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
         單張刪除
      ========================= */

      const match =
        path.match(
          /^\/api\/beauticians\/([^/]+)$/
        );

      if (
        match &&
        method === "DELETE"
      ) {

        const id =
          match[1];

        const db =
          await getDB(env);

        const before =
          db.beauticians.length;

        db.beauticians =
          db.beauticians.filter(
            x => x.id !== id
          );

        if (
          db.beauticians.length === before
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
         一鍵清除全部照片
      ========================= */

      if (
        path === "/api/beauticians/today" &&
        method === "DELETE"
      ) {

        const removed =
          await clearAllPhotos(env);

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
