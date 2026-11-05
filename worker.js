const KEY = "site";

const STORES = {
  muyu: {
    id: "muyu",
    name: "莯浴 SPA 養生館",
    line: "ww196",
    phone: "0915626688"
  },
  huanhuan: {
    id: "huanhuan",
    name: "歡歡 SPA",
    line: "happy527869",
    phone: "0966951250"
  },
  dream17: {
    id: "dream17",
    name: "夢十七",
    line: "",
    phone: "062824569"
  }
};

async function getDB(env) {
  if (!env.MUYU_KV) {
    throw new Error("MUYU_KV 尚未設定");
  }

  const raw = await env.MUYU_KV.get(KEY);

  if (!raw) {
    return { shifts: [] };
  }

  const db = JSON.parse(raw);

  if (!Array.isArray(db.shifts)) {
    db.shifts = [];
  }

  return db;
}

async function putDB(env, db) {
  await env.MUYU_KV.put(KEY, JSON.stringify(db));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

async function checkAuth(request, env) {
  const token = request.headers.get("Authorization") || "";
  return token === `Bearer ${env.ADMIN_TOKEN}`;
}

function validShift(body) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime || "") &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(body.endTime || "") &&
    Object.prototype.hasOwnProperty.call(STORES, body.storeId)
  );
}

export default {
  async scheduled() {
    // 新版不再自動刪除報班資料。
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/login" && method === "POST") {
        const body = await request.json();

        if (body.password !== env.ADMIN_PASSWORD) {
          return json({
            ok: false,
            message: "密碼錯誤"
          }, 401);
        }

        return json({
          ok: true,
          token: env.ADMIN_TOKEN
        });
      }

      if (path === "/api/site" && method === "GET") {
        const db = await getDB(env);

        const shifts = db.shifts
          .filter(item =>
            item &&
            item.id &&
            item.date &&
            item.startTime &&
            item.endTime &&
            STORES[item.storeId]
          )
          .sort((a, b) =>
            a.date.localeCompare(b.date)
          );

        return json({
          name: "台南按摩・SPA・養生館",
          profile: {
            number: "66",
            photo: "/no66.jpg"
          },
          shifts,
          stores: STORES
        });
      }

      if (
        path.startsWith("/api/") &&
        !(await checkAuth(request, env))
      ) {
        return json({
          ok: false,
          message: "未授權，請重新登入"
        }, 401);
      }

      if (path === "/api/shifts" && method === "POST") {
        const body = await request.json();

        if (!validShift(body)) {
          return json({
            ok: false,
            message: "日期、時間或店家資料不正確"
          }, 400);
        }

        const db = await getDB(env);

        const item = {
          id: crypto.randomUUID(),
          date: body.date,
          startTime: body.startTime,
          endTime: body.endTime,
          storeId: body.storeId
        };

        db.shifts.push(item);

        await putDB(env, db);

        return json({
          ok: true,
          shift: item
        });
      }

      const match = path.match(/^\/api\/shifts\/([^/]+)$/);

      if (match && method === "PUT") {
        const body = await request.json();

        if (!validShift(body)) {
          return json({
            ok: false,
            message: "日期、時間或店家資料不正確"
          }, 400);
        }

        const db = await getDB(env);
        const item = db.shifts.find(x => x.id === match[1]);

        if (!item) {
          return json({
            ok: false,
            message: "找不到這筆報班"
          }, 404);
        }

        item.date = body.date;
        item.startTime = body.startTime;
        item.endTime = body.endTime;
        item.storeId = body.storeId;

        await putDB(env, db);

        return json({
          ok: true,
          shift: item
        });
      }

      if (match && method === "DELETE") {
        const db = await getDB(env);
        const before = db.shifts.length;

        db.shifts = db.shifts.filter(
          x => x.id !== match[1]
        );

        if (db.shifts.length === before) {
          return json({
            ok: false,
            message: "找不到這筆報班"
          }, 404);
        }

        await putDB(env, db);

        return json({ ok: true });
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Not Found", { status: 404 });

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        message: error.message || "伺服器錯誤"
      }, 500);
    }
  }
};
