#!/usr/bin/env node
/**
 * نسخة احتياطية يدوية من Supabase.
 *
 * الخطة المجانية مافيهاش نسخ احتياطي تلقائي (`LAST BACKUP: No backups`)، فلو
 * الداتابيز باظت السجلات تضيع بلا رجوع. السكربت ده بيسحب كل جدول لملف JSON
 * على جهازك. مش بديل عن النسخ التلقائي — بس أحسن بمراحل من صفر.
 *
 * التشغيل:
 *   npm run backup
 *   npm run backup -- --out "D:\\نسخ" --with-audio --keep 30
 *
 * بيحتفظ بآخر ١٤ نسخة ويمسح الأقدم (كل نسخة ~٣٠ ميجا).
 *
 * محتاج متغيّرين: NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.
 * بياخدهم من .env.local لو موجود، وإلا من متغيّرات البيئة.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./lib/paginate.mjs";
import { foldersToPrune } from "./lib/retention.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PAGE_SIZE = 1000;

/**
 * الجداول المنسوخة. الترتيب من الأهم للأقل — لو السحب وقع في النص، اللي فوق
 * يكون خلص بالفعل.
 */
const TABLES = [
  { name: "profiles", why: "حسابات المناديب وأدوارهم" },
  { name: "field_checks", why: "سجلات التشييك الميداني" },
  { name: "recordings", why: "تسجيلات اللوحات" },
  { name: "chassis_records", why: "سجلات الشاص" },
  { name: "plate_corrections", why: "التعلّم المشترك" },
  { name: "subscription_events", why: "تاريخ الاشتراكات" },
  { name: "training_samples", why: "عيّنات التدريب (بيانات فقط)" },
];

/**
 * جداول مستثناة **بقصد**:
 *  - app_settings  → جوّاه مفتاح Deepgram وهاش كلمة السر الثانوية. كتابة أسرار
 *                    على القرص بصيغة نصّية مخاطرة أكبر من فايدتها، والمفتاح
 *                    نفسه موجود في لوحة Deepgram أصلاً.
 *  - training_audio → صوت base64، حجمه ضخم. يتنسخ بـ--with-audio لو احتجته.
 */
const OPT_IN = [{ name: "training_audio", flag: "--with-audio", why: "صوت التدريب (ضخم)" }];

function loadEnv() {
  // .env.local لو موجود (مش متتبّع بجيت)، وإلا متغيّرات البيئة.
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      [
        "",
        "✗ ناقص بيانات الاتصال.",
        "",
        "محتاج المتغيّرين دول:",
        "  NEXT_PUBLIC_SUPABASE_URL",
        "  SUPABASE_SERVICE_ROLE_KEY",
        "",
        "أسهل طريقة — اعمل ملف .env.local في جذر المشروع وحُطّ فيه السطرين",
        "(الملف مستثنى من جيت، فمش هيترفع). المفتاح تجيبه من:",
        "  Supabase → Project Settings → API → service_role",
        "",
        "⚠️ مفتاح service_role بيتخطّى كل الحماية — متبعتهوش لأي حد ولا تحطّه في شات.",
        "",
      ].join("\n")
    );
    process.exit(1);
  }

  return { url, key };
}

function parseArgs(argv) {
  const out = {
    dir: path.join(os.homedir(), "OneDrive", "نسخ-احتياطي-platehunter"),
    withAudio: false,
    keep: 14,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) out.dir = argv[++i];
    else if (argv[i] === "--with-audio") out.withAudio = true;
    else if (argv[i] === "--keep" && argv[i + 1]) out.keep = Number(argv[++i]);
  }
  return out;
}

/**
 * يمسح النسخ الأقدم من آخر `keep` نسخة. بيتنفّذ **بعد** نجاح النسخة الجديدة
 * عشان مانمسحش القديم قبل ما يبقى عندنا بديل.
 */
function pruneOld(dir, keep) {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const name of foldersToPrune(names, keep)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    console.log(`  مسحت النسخة القديمة: ${name}`);
  }
}

/** ٢٠٢٦-٠٧-٣٠_٢٢-٤٧ — يترتّب أبجدياً بالتاريخ. */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

async function backupTable(supabase, table) {
  return fetchAllRows(
    async (from, to) => {
      const { data, error } = await supabase.from(table).select("*").range(from, to);
      if (error) throw new Error(`${table}: ${error.message}`);
      return data ?? [];
    },
    PAGE_SIZE
  );
}

/**
 * حسابات الدخول من auth.users. مهمة للاسترجاع: بدونها الـprofiles أرقام بلا
 * حسابات تدخل بيها. ملاحظة: **كلمات السر مش بترجع** — Supabase مايصدّرهاش،
 * فالاسترجاع معناه إنشاء الحسابات من جديد بكلمات سر جديدة.
 */
async function backupAuthUsers(supabase) {
  const all = [];
  for (let page = 1; page <= 1000; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    const users = data?.users ?? [];
    if (users.length === 0) break;
    all.push(
      ...users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        user_metadata: u.user_metadata,
      }))
    );
    if (users.length < 200) break;
  }
  return all;
}

async function main() {
  const { url, key } = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const outDir = path.join(args.dir, stamp());
  fs.mkdirSync(outDir, { recursive: true });

  const targets = [...TABLES];
  if (args.withAudio) targets.push(...OPT_IN);

  console.log(`\nالنسخة الاحتياطية → ${outDir}\n`);

  const manifest = { at: new Date().toISOString(), tables: {}, errors: {} };
  let failed = 0;

  for (const { name, why } of targets) {
    process.stdout.write(`  ${name} … `);
    try {
      const rows = await backupTable(supabase, name);
      const file = path.join(outDir, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
      manifest.tables[name] = { rows: rows.length, bytes: fs.statSync(file).size, why };
      console.log(`${rows.length} صف ✓`);
    } catch (err) {
      failed++;
      manifest.errors[name] = err.message;
      console.log(`✗ ${err.message}`);
    }
  }

  process.stdout.write(`  auth.users … `);
  try {
    const users = await backupAuthUsers(supabase);
    fs.writeFileSync(
      path.join(outDir, "auth_users.json"),
      JSON.stringify(users, null, 2),
      "utf8"
    );
    manifest.tables["auth.users"] = { rows: users.length, why: "حسابات الدخول (بلا كلمات سر)" };
    console.log(`${users.length} حساب ✓`);
  } catch (err) {
    failed++;
    manifest.errors["auth.users"] = err.message;
    console.log(`✗ ${err.message}`);
  }

  manifest.skipped = {
    app_settings: "فيه أسرار (مفتاح Deepgram + هاش كلمة السر) — مستثنى بقصد",
    ...(args.withAudio ? {} : { training_audio: "استخدم --with-audio لو محتاجه" }),
  };

  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  const total = Object.values(manifest.tables).reduce((s, t) => s + t.rows, 0);
  console.log(`\n${failed ? "⚠️ " : "✅ "}إجمالي ${total} صف في ${outDir}`);
  if (failed) {
    // النسخة ناقصة — مانمسحش القديم، ساعتها هو اللي معانا.
    console.log(`   ${failed} جدول فشل — شوف _manifest.json (والقديم ماتمسحش)`);
    process.exit(1);
  }

  pruneOld(args.dir, args.keep);
  console.log(`   ⚠️ الملفات دي فيها بيانات مناديب — خليها في مكان خاص.\n`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
});
