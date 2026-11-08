// Sobe o servidor de desenvolvimento no modo local (IndexedDB), mesmo com o .env.local do Supabase presente.
// Útil para testar sem mexer nos dados da nuvem: npm run dev:local
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
};

const filho = spawn(process.execPath, ["scripts/copiar-worker.mjs"], { stdio: "inherit", env });
filho.on("exit", (codigo) => {
  if (codigo !== 0) process.exit(codigo ?? 1);
  const servidor = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)],
    { stdio: "inherit", env },
  );
  servidor.on("exit", (saida) => process.exit(saida ?? 0));
});
