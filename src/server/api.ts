import "server-only";
import { Router, dispatch } from "./http";
import { mapAuth } from "./routes/auth";
import { mapMerchant } from "./routes/merchant";
import { mapAdmin } from "./routes/admin";

const router = new Router();
mapAuth(router);
mapMerchant(router);
mapAdmin(router);

export function handle(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\/v1/, "") || "/";
  return dispatch(router, req, path);
}
