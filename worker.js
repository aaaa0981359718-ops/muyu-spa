const KEY = "site";

const DEFAULT_DB = {
  settings: {
    businessHours: "12：00～04：00",
    phone: "",
    line: ""
  },
  beauticians: []
};

async function getDB(env) {

  if (!env.MUYU_KV) {
    throw new Error("MUYU_KV 尚未設定");
  }

  const raw = await env.MUYU_KV.get(KEY);

  if (!raw) {
    await env.MUYU_KV.put(KEY, JSON.stringify(DEFAULT_DB));
    return structuredClone(DEFAULT_DB);
  }

  const db = JSON.parse(raw);

  db.settings = {
    ...DEFAULT_DB.settings,
    ...(db.settings || {})
  };

  db.beauticians = Array.isArray(db.beauticians)
    ? db.beauticians
    : [];

  return db;
}

async function putDB(env, db) {

  await env.MUYU_KV.put(
    KEY,
    JSON.stringify(db)
  );

}

async function checkAuth(request, env) {

  const token =
    request.headers.get("Authorization") || "";

  return token === `Bearer ${env.ADMIN_TOKEN}`;
}

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "content-type":"application/json;charset=UTF-8",
        "cache-control":"no-store"
      }
    }
  );

}

async function clearToday(env) {

  const db = await getDB(env);

  /*
    重要：
    這裡只刪除目前報班中的照片。
    不會刪除店家設定。
  */

  db.beauticians =
    db.beauticians.filter(
      x => !x.today
    );

  await putDB(env, db);

  return db;
}

export default {

  async scheduled(event, env, ctx) {

    /*
      Cloudflare Cron 每小時觸發。

      只有台灣時間凌晨 04:00 才真正清除。

      Cloudflare Worker 的時間基準為 UTC。
      台灣 UTC+8。
      台灣 04:00 = UTC 20:00（前一天）。

      因此這裡判斷 UTC 小時 20。
    */

    const now = new Date();

    const utcHour = now.getUTCHours();

    if (utcHour !== 20) {
      return;
    }

    try {

      await clearToday(env);

      console.log(
        "04:00 自動清除目前報班完成"
      );

    } catch(error) {

      console.error(
        "04:00 自動清除失敗",
        error
      );

    }

  },

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
              ok:false,
              message:"密碼錯誤"
            },
            401
          );

        }

        return json({
          ok:true,
          token:env.ADMIN_TOKEN
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
         以下需要登入
      ========================= */

      if (
        path.startsWith("/api/") &&
        !(await checkAuth(request, env))
      ) {

        return json(
          {
            ok:false,
            message:"未授權"
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
          ok:true,
          settings:db.settings
        });

      }

      /* =========================
         批次新增美容師照片
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
              ok:false,
              message:"沒有收到照片"
            },
            400
          );

        }

        if (photos.length > 8) {

          return json(
            {
              ok:false,
              message:"一次最多上傳 8 張照片"
            },
            400
          );

        }

        const db =
          await getDB(env);

        const newItems =
          photos.map((photo,index) => ({

            id:
              crypto.randomUUID(),

            name:
              `美容師${db.beauticians.length + index + 1}`,

            no:"",
            nationality:"",
            time:"",
            intro:"",

            photo:photo,

            /*
              新上傳照片：
              立即列入目前報班
            */

            today:true

          }));

        db.beauticians.push(
          ...newItems
        );

        await putDB(env, db);

        return json({
          ok:true,
          added:newItems.length
        });

      }

      /* =========================
         新增單張美容師
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

          no:body.no || "",

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
            body.photo || "",

          today:
            body.today !== false

        };

        db.beauticians.push(item);

        await putDB(env, db);

        return json({
          ok:true,
          item
        });

      }

      /* =========================
         修改美容師 / 上下班狀態
      ========================= */

      const updateMatch =
        path.match(
          /^\/api\/beauticians\/([^/]+)$/
        );

      if (
        updateMatch &&
        method === "PUT"
      ) {

        const id =
          updateMatch[1];

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
              ok:false,
              message:"找不到美容師"
            },
            404
          );

        }

        Object.assign(
          item,
          body
        );

        await putDB(env, db);

        return json({
          ok:true,
          item
        });

      }

      /* =========================
         永久刪除指定照片
      ========================= */

      if (
        updateMatch &&
        method === "DELETE"
      ) {

        const id =
          updateMatch[1];

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
              ok:false,
              message:"找不到照片"
            },
            404
          );

        }

        await putDB(env, db);

        return json({
          ok:true
        });

      }

      /* =========================
         一鍵清除目前報班
      ========================= */

      if (
        path === "/api/beauticians/today" &&
        method === "DELETE"
      ) {

        /*
          注意：
          這次是真的刪除照片資料。

          只刪除 today === true 的美容師。
          其他資料不受影響。
        */

        const db =
          await getDB(env);

        const before =
          db.beauticians.length;

        db.beauticians =
          db.beauticians.filter(
            x => !x.today
          );

        const removed =
          before -
          db.beauticians.length;

        await putDB(env, db);

        return json({
          ok:true,
          removed
        });

      }

      /* =========================
         網站檔案
      ========================= */

      if (
        env.ASSETS
      ) {

        return env.ASSETS.fetch(
          request
        );

      }

      return new Response(
        "Not Found",
        {
          status:404
        }
      );

    } catch(error) {

      console.error(error);

      return json(
        {
          ok:false,
          message:error.message ||
                  "伺服器錯誤"
        },
        500
      );

    }

  }

};
