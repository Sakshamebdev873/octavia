const port = Number(process.env.PORT ?? 4000);

const server = Bun.serve({
  port,
  fetch: () => Response.json({ ok: true }),
});

console.log(`Flowlet API listening on http://localhost:${server.port}`);
