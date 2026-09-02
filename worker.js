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

async function getDB(env) {
  if (!env.MUYU_KV) return seed;

  const raw = await env.MUYU_KV.get("site");

  return raw ? JSON.parse(raw) : seed;
}

async function putDB(env, db) {
  if (!env.MUYU_KV) {
    throw new Error("MUYU_KV 尚未設定");
  }

  await env.MUYU_KV.put(
    "site",
    JSON.stringify(db)
  );
}

function okAuth(c) {
  const expected = c.env.ADMIN_TOKEN || "";
  const got = c.req.header("Authorization") || "";

  return expected && got === `Bearer ${expected}`;
}


/* =========================
   網站資料
========================= */

app.get("/api/site", async c => {
  try {
    return c.json(await getDB(c.env));
  } catch {
    return c.json(
      { error: "資料讀取失敗" },
      500
    );
  }
});


/* =========================
   管理員登入
========================= */

app.post("/api/login", async c => {
  const body = await c.req
    .json()
    .catch(() => ({}));

  if (
    !c.env.ADMIN_PASSWORD ||
    body.password !== c.env.ADMIN_PASSWORD
  ) {
    return c.json(
      { error: "密碼錯誤" },
      401
    );
  }

  return c.json({
    token: c.env.ADMIN_TOKEN || ""
  });
});


/* =========================
   商店設定
========================= */

app.post("/api/settings", async c => {
  if (!okAuth(c)) {
    return c.json(
      { error: "未授權" },
      401
    );
  }

  try {
    const db = await getDB(c.env);
    const body = await c.req.json();

    db.settings = {
      ...db.settings,
      ...body
    };

    await putDB(c.env, db);

    return c.json(db.settings);

  } catch {
    return c.json(
      {
        error:
          "儲存失敗，請確認 KV 已設定"
      },
      500
    );
  }
});


/* =========================
   新增美容師
========================= */

app.post("/api/beauticians", async c => {
  if (!okAuth(c)) {
    return c.json(
      { error: "未授權" },
      401
    );
  }

  try {
    const body = await c.req.json();
    const db = await getDB(c.env);

    const item = {
      id: crypto.randomUUID(),

      no: body.no || "",

      name:
        body.name ||
        "美容師",

      nationality:
        body.nationality ||
        "",

      time:
        body.time ||
        "",

      intro:
        body.intro ||
        "",

      today:
        body.today !== false,

      photo:
        body.photo ||
        ""
    };

    db.beauticians.unshift(item);

    await putDB(c.env, db);

    return c.json(item);

  } catch {
    return c.json(
      {
        error:
          "新增失敗，請確認 KV 已設定"
      },
      500
    );
  }
});


/* =========================
   修改美容師
========================= */

app.put(
  "/api/beauticians/:id",
  async c => {

    if (!okAuth(c)) {
      return c.json(
        { error: "未授權" },
        401
      );
    }

    try {
      const db = await getDB(c.env);

      const id =
        c.req.param("id");

      const index =
        db.beauticians.findIndex(
          x => x.id === id
        );

      if (index < 0) {
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

      await putDB(c.env, db);

      return c.json(
        db.beauticians[index]
      );

    } catch {
      return c.json(
        {
          error:
            "更新失敗，請確認 KV 已設定"
        },
        500
      );
    }
  }
);


/* =========================
   刪除美容師
========================= */

app.delete(
  "/api/beauticians/:id",
  async c => {

    if (!okAuth(c)) {
      return c.json(
        { error: "未授權" },
        401
      );
    }

    try {
      const db =
        await getDB(c.env);

      db.beauticians =
        db.beauticians.filter(
          x =>
            x.id !==
            c.req.param("id")
        );

      await putDB(c.env, db);

      return c.json({
        ok: true
      });

    } catch {
      return c.json(
        {
          error:
            "刪除失敗，請確認 KV 已設定"
        },
        500
      );
    }
  }
);


/* =========================
   前台網站檔案
========================= */

app.all("*", async c => {

  const asset =
    await c.env.ASSETS.fetch(
      c.req.raw
    );

  if (asset.status !== 404) {
    return asset;
  }

  const indexRequest =
    new Request(
      new URL(
        "/index.html",
        c.req.url
      ),
      c.req.raw
    );

  return c.env.ASSETS.fetch(
    indexRequest
  );
});


export default app;
