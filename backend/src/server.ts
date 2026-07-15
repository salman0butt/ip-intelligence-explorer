import app from "./index.js";
import { readConfig } from "./config.js";

const { port } = readConfig();

app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server_started", port }));
});
